import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { attendances, levels, sessions, starLogs } from "@/db/schema";
import { dashboardCharts } from "@/server/services/dashboard";
import { type Fixture, resetDb, seedFixture } from "./helpers";

let f: Fixture;
// Thứ Tư 21/01/2026 (giờ Việt Nam). Tuần hiện tại bắt đầu Thứ Hai 19/01.
const now = new Date("2026-01-21T05:00:00Z");

beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  await db.insert(levels).values([
    { levelNo: 1, name: "Tân binh", minStars: 0, frameColor: "#b08d57" },
    { levelNo: 2, name: "Kỹ sư tập sự", minStars: 20, frameColor: "#cd7f32" },
  ]);
  const base = { startTime: "08:00", endTime: "09:30", status: "done" as const };
  const [a1, a2, b1, old] = await db
    .insert(sessions)
    .values([
      { ...base, classId: f.classA.id, date: "2026-01-13" },
      { ...base, classId: f.classA.id, date: "2026-01-20" },
      { ...base, classId: f.classB.id, date: "2026-01-20" },
      { ...base, classId: f.classA.id, date: "2025-11-04" }, // ngoài 30 ngày và ngoài 8 tuần
    ])
    .returning();
  const [sA1, sA2, sB1, sB2] = f.students;
  await db.insert(attendances).values([
    { sessionId: a1!.id, studentId: sA1!.id, status: "present" },
    { sessionId: a1!.id, studentId: sA2!.id, status: "absent" },
    { sessionId: a2!.id, studentId: sA1!.id, status: "late" },
    { sessionId: a2!.id, studentId: sA2!.id, status: "excused" },
    { sessionId: b1!.id, studentId: sB1!.id, status: "present" },
    { sessionId: b1!.id, studentId: sB2!.id, status: "present" },
    { sessionId: old!.id, studentId: sA1!.id, status: "absent" },
  ]);
  await db.insert(starLogs).values([
    { sessionId: a1!.id, studentId: sA1!.id, stars: 25 },
    { sessionId: a2!.id, studentId: sA1!.id, stars: -2 },
    { sessionId: a2!.id, studentId: sA2!.id, stars: 3 },
    { sessionId: b1!.id, studentId: sB1!.id, stars: 5 },
    { sessionId: old!.id, studentId: sA2!.id, stars: 9 },
  ]);
});

describe("số liệu biểu đồ trang Tổng quan", () => {
  it("Admin thấy toàn trung tâm", async () => {
    const data = await dashboardCharts(f.admin, now);
    expect(data.attendance).toEqual({ present: 3, late: 1, left_early: 0, excused: 1, absent: 1 });
    // Lớp A: 5 lượt (tính cả buổi cũ), có đi học 2 → 40%; lớp B: 2/2 → 100%.
    expect(data.classRates.map((c) => [c.code, c.rate, c.total])).toEqual([["A", 40, 5], ["B", 100, 2]]);
    expect(data.starsByWeek).toHaveLength(8);
    expect(data.starsByWeek.at(-1)).toEqual({ weekStart: "2026-01-19", stars: 6 }); // -2 + 3 + 5
    expect(data.starsByWeek.at(-2)).toEqual({ weekStart: "2026-01-12", stars: 25 });
    expect(data.starsByWeek.slice(0, 6).every((w) => w.stars === 0)).toBe(true);
    // A1 có 23 sao → cấp 2; 5 học viên còn lại ở cấp 1.
    expect(data.levels.map((l) => l.students)).toEqual([5, 1]);
  });

  it("GV chỉ thấy số liệu các lớp của mình", async () => {
    const data = await dashboardCharts(f.actorA, now);
    expect(data.attendance).toEqual({ present: 1, late: 1, left_early: 0, excused: 1, absent: 1 });
    expect(data.classRates.map((c) => c.code)).toEqual(["A"]);
    expect(data.starsByWeek.at(-1)!.stars).toBe(1);
    expect(data.levels.map((l) => l.students)).toEqual([1, 1]); // chỉ 2 học viên lớp A

    const other = await dashboardCharts(f.actorB, now);
    expect(other.classRates.map((c) => c.code)).toEqual(["B"]);
    expect(other.starsByWeek.at(-1)!.stars).toBe(5);
  });

  it("tài khoản GV không gắn giáo viên nhận số liệu rỗng", async () => {
    const data = await dashboardCharts({ ...f.actorA, teacherId: null }, now);
    expect(data.attendance).toEqual({ present: 0, late: 0, left_early: 0, excused: 0, absent: 0 });
    expect(data.classRates).toEqual([]);
    expect(data.starsByWeek.every((w) => w.stars === 0)).toBe(true);
    expect(data.levels.every((l) => l.students === 0)).toBe(true);
  });
});
