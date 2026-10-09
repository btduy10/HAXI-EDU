import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, extraClasses, rooms, timeSlots } from "@/db/schema";
import { DEFAULT_PERMISSIONS, type Menu, type MenuPermission } from "@/lib/permissions";
import type { Actor } from "@/server/guard";
import * as svc from "@/server/services/extra-classes";
import * as sessionSvc from "@/server/services/sessions";
import { type Fixture, resetDb, seedFixture } from "./helpers";

let f: Fixture;
let frame1: typeof timeSlots.$inferSelect;
let frame2: typeof timeSlots.$inferSelect;
let lab2: typeof rooms.$inferSelect;
const now = new Date("2026-02-01T05:00:00Z");

beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  [frame1, frame2] = (await db
    .insert(timeSlots)
    .values([
      { name: "Ca chiều", frame: 1, defaultStart: "13:30", defaultEnd: "15:00" },
      { name: "Ca chiều", frame: 2, defaultStart: "15:15", defaultEnd: "16:45" },
    ])
    .returning()) as [typeof timeSlots.$inferSelect, typeof timeSlots.$inferSelect];
  [lab2] = (await db.insert(rooms).values({ name: "Lab 2", capacity: 10 }).returning()) as [typeof rooms.$inferSelect];
});

// Thứ Tư, Ca chiều – Khung 1, phòng Lab, GV A.
const input = (extra: Partial<Parameters<typeof svc.createExtraClass>[1]> = {}) => ({
  name: "Toán thêm",
  courseId: f.course.id,
  roomId: f.room.id,
  weekday: 3,
  timeSlotId: frame1.id,
  teacherId: f.teacherA.id,
  ...extra,
});

const FULL: MenuPermission = { view: true, add: true, edit: true };
const withMenus = (actor: Actor, menus: Partial<Record<Menu, MenuPermission>>): Actor => ({
  ...actor,
  perms: { scope: "all", menus: { ...DEFAULT_PERMISSIONS.teacher.menus, ...menus } },
});

describe("lớp học thêm", () => {
  it("thêm, sửa theo quyền menu Thời khóa biểu (quyền Lớp học không đủ); xóa chỉ Admin; có nhật ký", async () => {
    await expect(svc.createExtraClass(f.actorA, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.listExtraClasses(f.actorA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Chỉ có quyền Lớp học: xem được danh sách nhưng không thêm, không sửa.
    const classesOnly = withMenus(f.actorA, { classes: FULL });
    await expect(svc.createExtraClass(classesOnly, input())).rejects.toMatchObject({ code: "FORBIDDEN" });
    // Có quyền Thêm/Sửa của Thời khóa biểu: thêm và sửa được, xóa thì không.
    const scheduler = withMenus(f.actorA, { timetable: FULL });
    const own = await svc.createExtraClass(scheduler, input({ name: "Của người xếp lịch", weekday: 5 }));
    await expect(svc.updateExtraClass(classesOnly, own.id, input({ name: "X", weekday: 5 }))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await svc.updateExtraClass(scheduler, own.id, input({ name: "Đã đổi tên", weekday: 5 }));
    await expect(svc.deleteExtraClass(scheduler, own.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await svc.deleteExtraClass(f.admin, own.id);
    await db.delete(auditLogs).where(eq(auditLogs.tableName, "extra_classes"));
    const row = await svc.createExtraClass(f.admin, input());
    await svc.updateExtraClass(f.admin, row.id, input({ name: "Toán thêm 2", teacherId: null }));
    expect(await svc.listExtraClasses(f.admin)).toMatchObject([
      { name: "Toán thêm 2", courseName: "Robotics", roomName: "Lab", weekday: 3, slotName: "Ca chiều", frame: 1, teacherName: null },
    ]);
    await expect(svc.deleteExtraClass(f.actorA, row.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await svc.deleteExtraClass(f.admin, row.id);
    expect(await db.select().from(extraClasses)).toHaveLength(0);
    expect(await db.select().from(auditLogs).where(eq(auditLogs.tableName, "extra_classes"))).toHaveLength(3);
  });

  it("báo trùng chỉ khi trùng cả Thứ + Ca + Khung giờ mà cùng phòng hoặc cùng giáo viên", async () => {
    const first = await svc.createExtraClass(f.admin, input());
    // Cùng thứ, cùng khung: trùng phòng (khác GV) và trùng GV (khác phòng) đều bị chặn.
    await expect(svc.createExtraClass(f.admin, input({ name: "X", teacherId: f.teacherB.id }))).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining('Trùng phòng với lớp học thêm "Toán thêm"'),
    });
    await expect(svc.createExtraClass(f.admin, input({ name: "X", roomId: lab2.id }))).rejects.toMatchObject({
      message: expect.stringContaining("Trùng giáo viên"),
    });
    // Khác khung giờ, khác thứ, hoặc khác cả phòng lẫn GV thì được.
    await svc.createExtraClass(f.admin, input({ name: "Khung 2", timeSlotId: frame2.id }));
    await svc.createExtraClass(f.admin, input({ name: "Thứ Năm", weekday: 4 }));
    await svc.createExtraClass(f.admin, input({ name: "Phòng khác", roomId: lab2.id, teacherId: f.teacherB.id }));
    // Sửa chính nó không tự báo trùng.
    await svc.updateExtraClass(f.admin, first.id, input({ name: "Đổi tên" }));
  });

  it("trùng với lịch mẫu của lớp theo cả hai chiều", async () => {
    const template = { classId: f.classA.id, weekday: 2, timeSlotId: frame1.id, roomId: null, teacherId: null, assistantTeacherId: null, startTime: null, endTime: null };
    await sessionSvc.createTemplate(f.admin, template, now);
    // Lớp A học Thứ Ba khung 1 ở phòng mặc định Lab → lớp học thêm cùng thứ, khung, phòng bị chặn.
    await expect(svc.createExtraClass(f.admin, input({ weekday: 2, teacherId: null }))).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining("lịch mẫu của lớp A"),
    });
    await svc.createExtraClass(f.admin, input({ weekday: 2, roomId: lab2.id, teacherId: null }));

    // Chiều ngược lại: thêm lịch mẫu trùng phòng với lớp học thêm (Thứ Tư khung 1, Lab) bị chặn.
    await svc.createExtraClass(f.admin, input());
    await expect(sessionSvc.createTemplate(f.admin, { ...template, classId: f.classB.id, weekday: 3 }, now)).rejects.toMatchObject({
      code: "CONFLICT",
      message: expect.stringContaining('lớp học thêm "Toán thêm"'),
    });
    await sessionSvc.createTemplate(f.admin, { ...template, classId: f.classB.id, weekday: 3, timeSlotId: frame2.id }, now);
  });

  it("trải ra Thời khóa biểu theo thứ; lọc theo phòng, giáo viên; TKB riêng chỉ có lớp của chính GV", async () => {
    await svc.createExtraClass(f.admin, input());
    await svc.createExtraClass(f.admin, input({ name: "Lý thêm", weekday: 5, roomId: lab2.id, teacherId: f.teacherB.id }));
    const week = { from: "2026-02-02", to: "2026-02-08" }; // Thứ Hai 02/02 → Chủ nhật 08/02
    const all = await svc.extraClassesForRange(f.admin, week);
    expect(all.map((e) => [e.date, e.name, e.startTime])).toEqual([
      ["2026-02-04", "Toán thêm", "13:30:00"],
      ["2026-02-06", "Lý thêm", "13:30:00"],
    ]);
    expect((await svc.extraClassesForRange(f.admin, { ...week, to: "2026-02-15" })).filter((e) => e.name === "Toán thêm")).toHaveLength(2);
    expect((await svc.extraClassesForRange(f.admin, { ...week, roomId: lab2.id })).map((e) => e.name)).toEqual(["Lý thêm"]);
    expect((await svc.extraClassesForRange(f.admin, { ...week, teacherId: f.teacherA.id })).map((e) => [e.name, e.teacherName, e.teacherShortName])).toEqual([
      ["Toán thêm", "Giáo viên A", null],
    ]);
    expect((await svc.extraClassesForRange(f.actorB, { ...week, personal: true })).map((e) => e.name)).toEqual(["Lý thêm"]);
  });
});
