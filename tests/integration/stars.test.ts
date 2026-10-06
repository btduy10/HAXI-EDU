import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { appSettings, auditLogs, avatars, classes, levels, sessions, starCriteria, starLogs, students } from "@/db/schema";
import { DEFAULT_PERMISSIONS } from "@/lib/permissions";
import * as avatarSvc from "@/server/services/avatars";
import * as stars from "@/server/services/stars";
import { type Fixture, resetDb, seedFixture } from "./helpers";

let f: Fixture;
let sessionA: typeof sessions.$inferSelect;
let sessionA2: typeof sessions.$inferSelect;
let crit: Record<string, string>;
let avatarId: Record<string, string>;
const now = new Date("2026-01-13T05:00:00Z");

beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  await db.insert(levels).values([
    { levelNo: 1, name: "Tân binh", minStars: 0, frameColor: "#b08d57" },
    { levelNo: 2, name: "Kỹ sư tập sự", minStars: 20, frameColor: "#cd7f32" },
    { levelNo: 3, name: "Kỹ sư", minStars: 50, frameColor: "#c0c0c0" },
  ]);
  await avatarSvc.ensureAvatarCatalog();
  avatarId = Object.fromEntries((await db.select().from(avatars)).map((a) => [a.name, a.id]));
  const criteria = await db
    .insert(starCriteria)
    .values([
      { name: "+20", stars: 20, type: "reward" },
      { name: "+3", stars: 3, type: "reward" },
      { name: "-1", stars: -1, type: "penalty" },
      { name: "-2", stars: -2, type: "penalty" },
      { name: "-3", stars: -3, type: "penalty" },
      { name: "ngừng", stars: 1, type: "reward", active: false },
    ])
    .returning();
  crit = Object.fromEntries(criteria.map((c) => [c.name, c.id]));
  [sessionA, sessionA2] = (await db
    .insert(sessions)
    .values([
      { classId: f.classA.id, date: "2026-01-06", startTime: "08:00", endTime: "09:30", teacherId: f.teacherA.id },
      { classId: f.classA.id, date: "2026-01-13", startTime: "08:00", endTime: "09:30", teacherId: f.teacherA.id },
    ])
    .returning()) as [typeof sessions.$inferSelect, typeof sessions.$inferSelect];
});

const a1 = () => f.students[0]!.id;
const a2 = () => f.students[1]!.id;
const give = (criteria: string, studentIds: string[], actor = f.actorA, session = sessionA) =>
  stars.awardStars(actor, { sessionId: session.id, criteriaId: crit[criteria]!, studentIds, note: null }, now);
const progress = async (studentId: string) => (await stars.progressOf(db, [studentId])).get(studentId)!;
const currentAvatar = async (studentId: string) => (await db.select().from(students).where(eq(students.id, studentId)))[0]!.currentAvatarId;

describe("ghi sao", () => {
  it("ghi cho một em, một nhóm, cả lớp; tổng tính khi truy vấn", async () => {
    expect(await give("+3", [a1()])).toMatchObject({ count: 1, stars: 3, levelChanges: [] });
    expect((await give("+3", [a1(), a2()])).count).toBe(2);
    expect((await progress(a1())).total).toBe(6);
    expect((await progress(a2())).total).toBe(3);
    const board = await stars.getSessionStarBoard(f.actorA, sessionA.id);
    expect(board.students.map((s) => [s.code, s.sessionStars])).toEqual([["A1", 6], ["A2", 3]]);
    expect(board.logs).toHaveLength(3);
    expect(board.criteria.map((c) => c.name)).not.toContain("ngừng");
  });

  it("tổng sao không bao giờ âm, cấp thấp nhất vẫn là cấp 1", async () => {
    await give("-3", [a1()]);
    const p = await progress(a1());
    expect(p).toMatchObject({ total: 0, level: { levelNo: 1 } });
    const [{ raw }] = (await db.execute(sql`select sum(stars)::int as raw from star_logs`)) as unknown as [{ raw: number }];
    expect(raw).toBe(-3); // sổ cái vẫn lưu đủ, chỉ tổng hiển thị bị chặn dưới 0
  });

  it("chỉ ghi cho học viên của buổi; từ chối tiêu chí ngừng dùng, buổi hủy, buổi chưa tới", async () => {
    await expect(give("+3", [a1(), f.students[2]!.id])).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await db.select().from(starLogs)).toEqual([]); // cả nhóm không được ghi
    await expect(give("ngừng", [a1()])).rejects.toMatchObject({ code: "VALIDATION" });
    const [future] = await db.insert(sessions).values({ classId: f.classA.id, date: "2026-02-03", startTime: "08:00", endTime: "09:30" }).returning();
    await expect(give("+3", [a1()], f.actorA, future!)).rejects.toMatchObject({ code: "CONFLICT" });
    await db.update(sessions).set({ status: "cancelled" }).where(eq(sessions.id, sessionA.id));
    await expect(give("+3", [a1()])).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("GV lớp khác không ghi, không xem, không hoàn tác được sao của lớp này", async () => {
    await expect(give("+3", [a1()], f.actorB)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stars.getSessionStarBoard(f.actorB, sessionA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await give("+3", [a1()]);
    const [log] = await db.select().from(starLogs);
    await expect(stars.undoStarLog(f.actorB, log!.id, now)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stars.getStudentStarProfile(f.actorB, a1())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(stars.listClassProgress(f.actorB, f.classA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await progress(a1())).total).toBe(3);
  });
});

describe("Admin xóa hẳn lịch sử sao", () => {
  const logsOf = async (studentId: string) => (await db.select().from(starLogs).where(eq(starLogs.studentId, studentId))).map((l) => l.stars).sort((x, y) => x - y);

  it("chỉ Admin; xóa một lần ghi thì xóa cả cặp ghi–hoàn tác và tính lại cấp", async () => {
    await give("+20", [a1(), a2()]);
    await give("+3", [a1()]);
    const [plus3] = await db.select().from(starLogs).where(sql`${starLogs.studentId} = ${a1()} and ${starLogs.stars} = 3`);
    await stars.undoStarLog(f.actorA, plus3!.id, now);
    const [reversal] = await db.select().from(starLogs).where(eq(starLogs.reversesLogId, plus3!.id));
    await expect(stars.deleteStudentStarLogs(f.actorA, { studentId: a1(), logId: plus3!.id })).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Lần ghi của học viên khác không xóa được qua hồ sơ của em này.
    await expect(stars.deleteStudentStarLogs(f.admin, { studentId: a2(), logId: plus3!.id })).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Chọn bản ghi hoàn tác → xóa cả lần ghi gốc.
    expect(await stars.deleteStudentStarLogs(f.admin, { studentId: a1(), logId: reversal!.id })).toMatchObject({ deleted: 2 });
    expect(await logsOf(a1())).toEqual([20]);
    expect((await progress(a1())).level.levelNo).toBe(2);

    const [plus20] = await db.select().from(starLogs).where(eq(starLogs.studentId, a1()));
    await stars.deleteStudentStarLogs(f.admin, { studentId: a1(), logId: plus20!.id });
    expect(await logsOf(a1())).toEqual([]);
    expect((await progress(a1())).level.levelNo).toBe(1);
    expect(await logsOf(a2())).toEqual([20]); // học viên khác không bị đụng tới
  });

  it("xóa hết giữ lại sao của lớp đã đóng", async () => {
    await give("+20", [a1()]);
    await give("+3", [a1()], f.actorA, sessionA2);
    const [closedSession] = await db.insert(sessions).values({ classId: f.classB.id, date: "2026-01-07", startTime: "08:00", endTime: "09:30" }).returning();
    const [closedLog] = await db.insert(starLogs).values({ sessionId: closedSession!.id, studentId: a1(), stars: 5 }).returning();
    await db.update(classes).set({ status: "closed" }).where(eq(classes.id, f.classB.id));

    await expect(stars.deleteStudentStarLogs(f.admin, { studentId: a1(), logId: closedLog!.id })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await stars.deleteStudentStarLogs(f.admin, { studentId: a1() })).toEqual({ deleted: 2, keptClosed: 1 });
    expect(await logsOf(a1())).toEqual([5]);
    const [entry] = await db.select().from(auditLogs).where(eq(auditLogs.action, "star_logs_deleted_all"));
    expect(entry?.recordId).toBe(a1());
  });
});

describe("giới hạn trừ sao mỗi buổi (mặc định 3)", () => {
  it("chặn khi tổng trừ trong buổi vượt giới hạn; buổi khác tính riêng", async () => {
    await give("-2", [a1()]);
    await expect(give("-2", [a1()])).rejects.toMatchObject({ code: "CONFLICT" });
    await give("-1", [a1()]);
    await expect(give("-1", [a1()])).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(give("-3", [a1()], f.actorA, sessionA2)).resolves.toBeDefined();
    // Thưởng không bị ảnh hưởng bởi giới hạn trừ.
    await expect(give("+3", [a1()])).resolves.toBeDefined();
  });

  it("ghi theo nhóm: một em vượt giới hạn thì không em nào bị trừ", async () => {
    await give("-3", [a1()]);
    await expect(give("-1", [a1(), a2()])).rejects.toMatchObject({ code: "CONFLICT", message: expect.stringContaining("Học viên A1") });
    expect((await db.select().from(starLogs)).length).toBe(1);
  });

  it("hoàn tác lần trừ thì được trừ lại; giới hạn lấy từ cấu hình", async () => {
    await give("-3", [a1()]);
    const [log] = await db.select().from(starLogs);
    await stars.undoStarLog(f.actorA, log!.id, now);
    await expect(give("-3", [a1()])).resolves.toBeDefined();
    await db.insert(appSettings).values({ key: "max_deduction_per_session", value: 5 });
    await expect(give("-2", [a1()])).resolves.toBeDefined();
    await expect(give("-1", [a1()])).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("lên cấp, tụt cấp và avatar", () => {
  it("lên cấp trả thông báo chúc mừng, không tự đổi avatar đang dùng", async () => {
    await give("+3", [a1()]); // gán avatar cấp 1 lần đầu, không báo
    const first = await currentAvatar(a1());
    expect(first).toBe(avatarId["Bu Lông"]);
    const result = await give("+20", [a1()]);
    expect(result.levelChanges).toEqual([
      { studentId: a1(), fullName: "Học viên A1", direction: "up", fromLevel: "Tân binh", toLevel: "Kỹ sư tập sự", avatarSwitchedTo: null },
    ]);
    expect(await currentAvatar(a1())).toBe(first);
  });

  it("trừ sao làm tụt cấp: avatar đang dùng bị khóa → tự đổi sang avatar cao nhất còn mở, có nhật ký", async () => {
    await give("+20", [a1()]);
    await give("+3", [a1()]); // 23 sao, cấp 2
    await avatarSvc.setStudentAvatar(f.actorA, a1(), avatarId["Bánh Răng"]!); // avatar cấp 2
    await give("-3", [a1()]); // 20 sao: vẫn cấp 2
    expect(await currentAvatar(a1())).toBe(avatarId["Bánh Răng"]);

    const result = await give("-1", [a1()], f.actorA, sessionA2); // 19 sao → cấp 1
    expect(result.levelChanges).toEqual([
      { studentId: a1(), fullName: "Học viên A1", direction: "down", fromLevel: "Kỹ sư tập sự", toLevel: "Tân binh", avatarSwitchedTo: "Bu Lông" },
    ]);
    expect(await currentAvatar(a1())).toBe(avatarId["Bu Lông"]);
    expect(await progress(a1())).toMatchObject({ total: 19, level: { levelNo: 1 }, starsToNext: 1 });
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "avatar_auto_switched"));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ recordId: a1(), oldValue: { currentAvatarId: avatarId["Bánh Răng"] } });
  });

  it("avatar được tặng riêng không mất khi tụt cấp", async () => {
    await give("+20", [a1()]);
    await avatarSvc.giftAvatar(f.admin, a1(), avatarId["Lửa Thiêng"]!);
    await avatarSvc.setStudentAvatar(f.actorA, a1(), avatarId["Lửa Thiêng"]!);
    const result = await give("-1", [a1()]);
    expect(result.levelChanges).toMatchObject([{ direction: "down", avatarSwitchedTo: null }]);
    expect(await currentAvatar(a1())).toBe(avatarId["Lửa Thiêng"]);
  });

  it("hoàn tác: ghi bản đảo, không xóa; chỉ một lần; hoàn tác lần thưởng làm tụt cấp và đổi avatar", async () => {
    await give("+3", [a1()]);
    await give("+20", [a1()]);
    await avatarSvc.setStudentAvatar(f.actorA, a1(), avatarId["Kính Thép"]!);
    const logs = await db.select().from(starLogs);
    const big = logs.find((l) => l.stars === 20)!;

    const result = await stars.undoStarLog(f.actorA, big.id, now);
    expect(result.levelChanges).toMatchObject([{ direction: "down", toLevel: "Tân binh", avatarSwitchedTo: "Bu Lông" }]);
    expect((await progress(a1())).total).toBe(3);
    const after = await db.select().from(starLogs);
    expect(after).toHaveLength(3);
    const reversal = after.find((l) => l.reversesLogId === big.id)!;
    expect(reversal.stars).toBe(-20);

    await expect(stars.undoStarLog(f.actorA, big.id, now)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(stars.undoStarLog(f.actorA, reversal.id, now)).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await db.select().from(starLogs)).toHaveLength(3);
  });

  it("sổ cái không sửa, không xóa được ở mức CSDL", async () => {
    await give("+3", [a1()]);
    await expect(db.update(starLogs).set({ stars: 999 })).rejects.toThrow();
    await expect(db.delete(starLogs)).rejects.toThrow();
    expect((await progress(a1())).total).toBe(3);
  });
});

describe("đổi và tặng avatar", () => {
  it("chỉ chọn được avatar đã mở theo cấp hoặc được tặng; ghi nhật ký", async () => {
    await expect(avatarSvc.setStudentAvatar(f.actorA, a1(), avatarId["Bánh Răng"]!)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(avatarSvc.setStudentAvatar(f.actorA, a1(), avatarId["Lửa Thiêng"]!)).rejects.toMatchObject({ code: "CONFLICT" });
    await avatarSvc.setStudentAvatar(f.actorA, a1(), avatarId["Pico"]!);
    expect(await currentAvatar(a1())).toBe(avatarId["Pico"]);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.action, "avatar_changed"));
    expect(logs).toMatchObject([{ userId: f.actorA.userId, recordId: a1(), newValue: { currentAvatarId: avatarId["Pico"] } }]);

    const profile = await stars.getStudentStarProfile(f.actorA, a1());
    const byName = Object.fromEntries(profile.avatars.map((a) => [a.name, a]));
    expect(byName["Pico"]).toMatchObject({ unlocked: true });
    expect(byName["Bánh Răng"]).toMatchObject({ unlocked: false, requiredMinStars: 20 });
    expect(byName["Lửa Thiêng"]).toBeUndefined(); // avatar tặng riêng chưa được tặng thì không hiện
  });

  it("GV lớp khác không đổi được avatar; chỉ Admin tặng avatar và chỉ loại tặng riêng", async () => {
    await expect(avatarSvc.setStudentAvatar(f.actorB, a1(), avatarId["Pico"]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(avatarSvc.giftAvatar(f.actorA, a1(), avatarId["Lửa Thiêng"]!)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(avatarSvc.giftAvatar(f.admin, a1(), avatarId["Vua Robot"]!)).rejects.toMatchObject({ code: "VALIDATION" });
    await avatarSvc.giftAvatar(f.admin, a1(), avatarId["Lửa Thiêng"]!);
    await expect(avatarSvc.giftAvatar(f.admin, a1(), avatarId["Lửa Thiêng"]!)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(avatarSvc.setStudentAvatar(f.actorA, a1(), avatarId["Lửa Thiêng"]!)).resolves.toBeDefined();
    // Avatar được tặng cho A1 không dùng được cho A2.
    await expect(avatarSvc.setStudentAvatar(f.actorA, a2(), avatarId["Lửa Thiêng"]!)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("GV dạy thay hôm nay đổi được avatar học viên của buổi đó; hết hôm nay thì không", async () => {
    const today = new Date();
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(today);
    await db.insert(sessions).values({ classId: f.classA.id, date, startTime: "20:00", endTime: "21:00", teacherId: f.teacherA.id, substituteTeacherId: f.teacherB.id });
    await expect(avatarSvc.setStudentAvatar(f.actorB, a1(), avatarId["Pico"]!)).resolves.toBeDefined();
    await db.update(sessions).set({ date: "2026-01-20" }).where(eq(sessions.substituteTeacherId, f.teacherB.id));
    await expect(avatarSvc.setStudentAvatar(f.actorB, a1(), avatarId["Gizmo"]!)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("Admin quản lý tiêu chí, cấp bậc, kho avatar", () => {
  it("GV bị từ chối", async () => {
    const denied = { code: "FORBIDDEN" };
    const [level] = await db.select().from(levels).limit(1);
    await expect(stars.createCriteria(f.actorA, { name: "x", stars: 10, active: true, type: "reward" })).rejects.toMatchObject(denied);
    await expect(stars.updateLevel(f.actorA, level!.id, { levelNo: 1, name: "x", minStars: 0, frameColor: "#000000" })).rejects.toMatchObject(denied);
    await expect(avatarSvc.updateAvatar(f.actorA, avatarId["Pico"]!, { name: "x", requiredLevelId: level!.id, active: true })).rejects.toMatchObject(denied);
    await expect(avatarSvc.giftAvatar(f.actorA, a1(), avatarId["Pico"]!)).rejects.toMatchObject(denied);
    // Không được tick Xem ở menu Sao & Avatar thì không xem được sổ cái và kho avatar.
    const noStars = { ...f.actorA, perms: { scope: "own" as const, menus: { ...DEFAULT_PERMISSIONS.teacher.menus, stars: { view: false, add: false, edit: false } } } };
    await expect(stars.listRecentStarLogs(noStars)).rejects.toMatchObject(denied);
    await expect(avatarSvc.listAvatarCatalog(noStars)).rejects.toMatchObject(denied);
  });

  it("đổi mốc sao của cấp làm đổi cấp học viên và tự đổi avatar bị khóa; bảng cấp phải tăng dần", async () => {
    await give("+20", [a1()]);
    await give("+3", [a1()]);
    await avatarSvc.setStudentAvatar(f.actorA, a1(), avatarId["Bánh Răng"]!);
    const all = await db.select().from(levels).orderBy(levels.levelNo);
    const l2 = all[1]!;
    await expect(stars.updateLevel(f.admin, l2.id, { levelNo: 2, name: l2.name, minStars: 50, frameColor: l2.frameColor })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await stars.updateLevel(f.admin, l2.id, { levelNo: 2, name: l2.name, minStars: 30, frameColor: l2.frameColor });
    expect(await progress(a1())).toMatchObject({ total: 23, level: { levelNo: 1 }, starsToNext: 7 });
    expect(await currentAvatar(a1())).toBe(avatarId["Bu Lông"]);
    await expect(stars.deleteLevel(f.admin, all[0]!.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("tắt avatar đang được dùng thì học viên được chuyển sang avatar khác; luôn còn avatar cấp 1", async () => {
    await avatarSvc.setStudentAvatar(f.actorA, a1(), avatarId["Pico"]!);
    const level1 = (await db.select().from(levels).orderBy(levels.levelNo))[0]!;
    await avatarSvc.updateAvatar(f.admin, avatarId["Pico"]!, { name: "Pico", requiredLevelId: level1.id, active: false });
    expect(await currentAvatar(a1())).toBe(avatarId["Bu Lông"]);
    await avatarSvc.updateAvatar(f.admin, avatarId["Bu Lông"]!, { name: "Bu Lông", requiredLevelId: level1.id, active: false });
    await expect(
      avatarSvc.updateAvatar(f.admin, avatarId["Gizmo"]!, { name: "Gizmo", requiredLevelId: level1.id, active: false }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
