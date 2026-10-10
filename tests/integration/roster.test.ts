import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { classes, enrollments, scheduleTemplates, students, timeSlots } from "@/db/schema";
import { DEFAULT_PERMISSIONS, type RolePermissions } from "@/lib/permissions";
import type { Actor } from "@/server/guard";
import * as classSvc from "@/server/services/classes";
import { type Fixture, resetDb, seedFixture } from "./helpers";

// Lớp A: Tối Thứ 2 và Sáng Thứ 7. Lớp B: Tối Thứ 2. Mỗi lớp 2 học viên (bối cảnh chuẩn).
let f: Fixture;
let evening: typeof timeSlots.$inferSelect;

const withEnrollments = (actor: Actor, scope: RolePermissions["scope"]): Actor => ({
  ...actor,
  perms: { scope, menus: { ...DEFAULT_PERMISSIONS.teacher.menus, enrollments: { view: true, add: false, edit: false } } },
});

beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  const slots = await db
    .insert(timeSlots)
    .values([
      { name: "Ca tối", frame: 1, defaultStart: "18:00", defaultEnd: "19:30" },
      { name: "Ca tối", frame: 2, defaultStart: "19:30", defaultEnd: "21:00" },
      { name: "Ca sáng", frame: 1, defaultStart: "08:00", defaultEnd: "09:30" },
    ])
    .returning();
  evening = slots[0]!;
  await db.insert(scheduleTemplates).values([
    { classId: f.classA.id, weekday: 6, timeSlotId: slots[2]!.id },
    { classId: f.classA.id, weekday: 1, timeSlotId: slots[0]!.id },
    // Hai khung của cùng ca trong cùng một thứ vẫn là một buổi.
    { classId: f.classA.id, weekday: 1, timeSlotId: slots[1]!.id },
    { classId: f.classB.id, weekday: 1, timeSlotId: slots[0]!.id },
  ]);
  await db.update(students).set({ schoolGrade: 5 }).where(eq(students.code, "A1"));
});

describe("tổng quan Ghi danh theo buổi trong tuần", () => {
  it("mỗi lớp một khung ở từng buổi của lịch mẫu, đúng thứ tự buổi, kèm học viên đang học và khối", async () => {
    const { blocks, unscheduled } = await classSvc.weeklyRoster(f.admin);
    expect(blocks.map((b) => `${b.label}|${b.classCode}`)).toEqual(["Tối Thứ 2|A", "Tối Thứ 2|B", "Sáng Thứ 7|A"]);
    expect(unscheduled).toEqual([]);
    const [first, , saturday] = blocks;
    expect(first).toMatchObject({ classId: f.classA.id, maxSize: 3, startDate: "2026-01-06" });
    expect(first!.students.map((s) => s.fullName)).toEqual(["Học viên A1", "Học viên A2"]);
    expect(first!.students[0]).toEqual({ id: f.students[0]!.id, fullName: "Học viên A1", schoolGrade: 5 });
    // Lớp học 2 buổi/tuần: cùng danh sách học viên ở cả hai buổi.
    expect(saturday!.students).toEqual(first!.students);
  });

  it("học viên mới vào lớp nằm ở hàng kế tiếp; em đã rời lớp không còn trong bảng", async () => {
    await classSvc.enrollStudent(f.admin, { classId: f.classA.id, studentId: f.students[4]!.id, joinedAt: "2026-02-01" });
    const [enrollment] = await db.select().from(enrollments).where(eq(enrollments.studentId, f.students[1]!.id));
    await classSvc.leaveEnrollment(f.admin, { id: enrollment!.id, leftAt: "2026-02-10" });
    const { blocks } = await classSvc.weeklyRoster(f.admin);
    expect(blocks[0]!.students.map((s) => s.fullName)).toEqual(["Học viên A1", "Học viên X1"]);
  });

  it("không gồm lớp đã đóng và lớp chỉ hiển thị trên Thời khóa biểu; lớp đang mở chưa có lịch mẫu nằm ở danh sách riêng", async () => {
    await db.update(classes).set({ status: "closed" }).where(eq(classes.id, f.classB.id));
    const [lend, fresh] = await db
      .insert(classes)
      .values([
        { code: "MP", name: "Mượn phòng", courseId: f.course.id, startDate: "2026-01-06", endDate: "2026-03-31", maxSize: 1, timetableOnly: true },
        { code: "M", name: "Lớp mới", courseId: f.course.id, startDate: "2026-01-06", endDate: "2026-03-31", maxSize: 8 },
      ])
      .returning();
    await db.insert(scheduleTemplates).values({ classId: lend!.id, weekday: 2, timeSlotId: evening.id });
    const { blocks, unscheduled } = await classSvc.weeklyRoster(f.admin);
    expect(blocks.map((b) => `${b.label}|${b.classCode}`)).toEqual(["Tối Thứ 2|A", "Sáng Thứ 7|A"]);
    expect(unscheduled).toEqual([{ id: fresh!.id, code: "M", name: "Lớp mới" }]);
  });

  it("theo quyền menu Ghi danh; phạm vi lớp của mình chỉ thấy lớp mình", async () => {
    // Giáo viên mặc định không có quyền menu Ghi danh.
    await expect(classSvc.weeklyRoster(f.actorA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const own = await classSvc.weeklyRoster(withEnrollments(f.actorA, "own"));
    expect([...new Set(own.blocks.map((b) => b.classCode))]).toEqual(["A"]);
    const all = await classSvc.weeklyRoster(withEnrollments(f.actorA, "all"));
    expect([...new Set(all.blocks.map((b) => b.classCode))].sort()).toEqual(["A", "B"]);
  });
});
