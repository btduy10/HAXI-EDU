import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { account, auditLogs, session, students, user } from "@/db/schema";
import { verifyPassword } from "@/server/password";
import * as accounts from "@/server/services/accounts";
import * as catalog from "@/server/services/catalog";
import * as classes from "@/server/services/classes";
import { type Fixture, resetDb, seedFixture } from "./helpers";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

describe("ghi danh", () => {
  const enroll = (i: number, joinedAt = "2026-01-10") =>
    classes.enrollStudent(f.admin, { classId: f.classA.id, studentId: f.students[i]!.id, joinedAt });

  it("chặn khi vượt sĩ số tối đa", async () => {
    await enroll(4); // lớp A: 2 → 3 (tối đa 3)
    await expect(enroll(5)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("không ghi danh trùng học viên đang học", async () => {
    await expect(enroll(0)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("rời lớp giữ lịch sử và cho ghi danh lại", async () => {
    const list = await classes.listEnrollments(f.admin, f.classA.id);
    const first = list.find((e) => e.code === "A1")!;
    await expect(classes.leaveEnrollment(f.admin, { id: first.id, leftAt: "2026-01-01" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await classes.leaveEnrollment(f.admin, { id: first.id, leftAt: "2026-02-01" });
    await enroll(0, "2026-03-01");
    const after = (await classes.listEnrollments(f.admin, f.classA.id)).filter((e) => e.code === "A1");
    expect(after.map((e) => e.status).sort()).toEqual(["active", "left"]);
  });

  it("không ghi danh học viên đã nghỉ hoặc vào lớp đã đóng", async () => {
    await db.update(students).set({ status: "left" }).where(eq(students.id, f.students[4]!.id));
    await expect(enroll(4)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("danh mục và nhật ký", () => {
  it("tạo/sửa/xóa ghi audit_logs kèm giá trị cũ và mới", async () => {
    const room = await catalog.createRoom(f.admin, { name: "Lab 9", capacity: 6 });
    await catalog.updateRoom(f.admin, room.id, { name: "Lab 9", capacity: 8 });
    await catalog.deleteRoom(f.admin, room.id);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.recordId, room.id)).orderBy(auditLogs.createdAt);
    expect(logs.map((l) => l.action)).toEqual(["create", "update", "delete"]);
    expect(logs[1]!.oldValue).toMatchObject({ capacity: 6 });
    expect(logs[1]!.newValue).toMatchObject({ capacity: 8 });
    expect(logs.every((l) => l.userId === f.admin.userId)).toBe(true);
  });

  it("trùng mã báo lỗi CONFLICT, xóa dữ liệu đang dùng bị chặn", async () => {
    await expect(catalog.createTeacher(f.admin, { code: "GVA", fullName: "Trùng", phone: null, email: null, status: "active" })).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(catalog.deleteCourse(f.admin, f.course.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("tài khoản", () => {
  const input = { username: "gv.moi", name: "GV mới", role: "teacher" as const, teacherId: null, password: "MatKhauTam123" };

  it("tạo tài khoản: băm Argon2id, buộc đổi mật khẩu, không lưu mật khẩu vào nhật ký", async () => {
    const { id } = await accounts.createAccount(f.admin, { ...input, teacherId: f.teacherA.id });
    const [u] = await db.select().from(user).where(eq(user.id, id));
    const [a] = await db.select().from(account).where(eq(account.userId, id));
    expect(u!.mustChangePassword).toBe(true);
    expect(a!.password).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword({ hash: a!.password!, password: input.password })).toBe(true);
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.recordId, id));
    expect(JSON.stringify(logs)).not.toContain(input.password);
    await expect(accounts.createAccount(f.admin, { ...input, teacherId: f.teacherA.id })).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("khóa tài khoản thu hồi phiên; không tự khóa chính mình", async () => {
    await db.insert(session).values({ id: "s1", token: "t1", userId: f.actorA.userId, expiresAt: new Date(Date.now() + 3600_000) });
    await accounts.setAccountLocked(f.admin, f.actorA.userId, true);
    const [u] = await db.select().from(user).where(eq(user.id, f.actorA.userId));
    expect(u!.lockedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await db.select().from(session).where(eq(session.userId, f.actorA.userId))).toEqual([]);
    await expect(accounts.setAccountLocked(f.admin, f.admin.userId, true)).rejects.toMatchObject({ code: "CONFLICT" });
    await accounts.setAccountLocked(f.admin, f.actorA.userId, false);
    const [unlocked] = await db.select().from(user).where(eq(user.id, f.actorA.userId));
    expect(unlocked!.lockedUntil).toBeNull();
  });

  it("đặt lại mật khẩu buộc đổi lại và thu hồi phiên", async () => {
    const { id } = await accounts.createAccount(f.admin, { ...input, teacherId: f.teacherA.id });
    await db.update(user).set({ mustChangePassword: false }).where(eq(user.id, id));
    await db.insert(session).values({ id: "s2", token: "t2", userId: id, expiresAt: new Date(Date.now() + 3600_000) });
    await accounts.resetAccountPassword(f.admin, id, "MatKhauKhac456");
    const [u] = await db.select().from(user).where(eq(user.id, id));
    const [a] = await db.select().from(account).where(eq(account.userId, id));
    expect(u!.mustChangePassword).toBe(true);
    expect(await verifyPassword({ hash: a!.password!, password: "MatKhauKhac456" })).toBe(true);
    expect(await db.select().from(session).where(eq(session.userId, id))).toEqual([]);
  });
});
