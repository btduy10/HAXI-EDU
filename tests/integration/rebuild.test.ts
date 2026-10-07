import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { attendances, scheduleTemplates, sessions, teachers, timeSlots } from "@/db/schema";
import * as svc from "@/server/services/sessions";
import { type Fixture, resetDb, seedFixture } from "./helpers";

// Lớp A: 05/01/2026 → 31/03/2026, khóa học 10 buổi.
let f: Fixture;
let morning: typeof timeSlots.$inferSelect;
let evening: typeof timeSlots.$inferSelect;

beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  [morning, evening] = (await db
    .insert(timeSlots)
    .values([
      { name: "Ca sáng", defaultStart: "08:00", defaultEnd: "09:30" },
      { name: "Ca tối", defaultStart: "18:00", defaultEnd: "19:30" },
    ])
    .returning()) as [typeof timeSlots.$inferSelect, typeof timeSlots.$inferSelect];
});

const sessionsOf = (classId: string) =>
  db.select().from(sessions).where(eq(sessions.classId, classId)).orderBy(asc(sessions.date), asc(sessions.startTime));

describe("xếp lại lịch lớp theo lịch mẫu", () => {
  it("xếp đúng thứ, ca, GV của lịch mẫu, đủ số buổi khóa học; bỏ buổi chưa dạy sai lịch, giữ buổi đã dạy", async () => {
    // Lịch cũ sai: 20 buổi Thứ Hai ca sáng, chưa có GV; một buổi đã điểm danh.
    const [teacherC] = await db.insert(teachers).values({ code: "GVC", fullName: "GV C" }).returning();
    const wrong = Array.from({ length: 12 }, (_, i) => {
      const day = new Date(Date.UTC(2026, 0, 5 + i * 7)).toISOString().slice(0, 10);
      return { classId: f.classA.id, date: day, startTime: "08:00", endTime: "09:30", timeSlotId: morning.id };
    });
    const inserted = await db.insert(sessions).values(wrong).returning();
    await db.insert(attendances).values({ sessionId: inserted[0]!.id, studentId: f.students[0]!.id, status: "present" });
    await db.update(sessions).set({ status: "done" }).where(eq(sessions.id, inserted[0]!.id));

    // Lịch mẫu đúng: Thứ Tư ca tối, GV C dạy chính, GV A trợ giảng.
    await db.insert(scheduleTemplates).values({ classId: f.classA.id, weekday: 3, timeSlotId: evening.id, teacherId: teacherC!.id, assistantTeacherId: f.teacherA.id });
    const result = await svc.rebuildSchedule(f.admin, f.classA.id);

    expect(result).toMatchObject({ removed: 11, created: 9, scheduled: 10, courseSessions: 10 });
    const list = await sessionsOf(f.classA.id);
    expect(list).toHaveLength(10);
    expect(list[0]!.id).toBe(inserted[0]!.id); // buổi đã dạy giữ nguyên
    const rebuilt = list.slice(1);
    expect(rebuilt.every((s) => new Date(`${s.date}T00:00:00Z`).getUTCDay() === 3)).toBe(true);
    expect(rebuilt.every((s) => s.startTime === "18:00:00" && s.timeSlotId === evening.id)).toBe(true);
    expect(rebuilt.every((s) => s.teacherId === teacherC!.id && s.assistantTeacherId === f.teacherA.id)).toBe(true);
    expect(rebuilt[0]!.date).toBe("2026-01-07");

    // Trang Lớp học hiển thị tình trạng lịch: 10/10 buổi, buổi đầu, đã dạy 1, buổi sắp tới kèm GV.
    const overview = await svc.classScheduleOverview(f.admin, f.classA.id, "2026-01-08");
    expect(overview).toMatchObject({ courseSessions: 10, scheduled: 10, done: 1, missingTeacher: 1 });
    expect(overview.first!.date).toBe("2026-01-05");
    expect(overview.upcoming.map((s) => [s.date, s.teacherName, s.assistantName])[0]).toEqual(["2026-01-14", "GV C", "Giáo viên A"]);

    // Bấm lại: vẫn đúng 10 buổi.
    await svc.rebuildSchedule(f.admin, f.classA.id);
    expect(await sessionsOf(f.classA.id)).toHaveLength(10);
    await expect(svc.rebuildSchedule(f.actorA, f.classA.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
