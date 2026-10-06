import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { teacherTimesheet } from "@/server/services/timesheet";
import { type Fixture, resetDb, seedFixture } from "./helpers";

let f: Fixture;
// Thứ Tư 21/01/2026 (giờ Việt Nam).
const now = new Date("2026-01-21T05:00:00Z");
const january = { from: "2026-01-01", to: "2026-01-31" };

beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  const a = { classId: f.classA.id, teacherId: f.teacherA.id, startTime: "08:00", endTime: "09:30" };
  await db.insert(sessions).values([
    { ...a, date: "2026-01-06", status: "done" },
    { ...a, date: "2026-01-13", status: "done", substituteTeacherId: f.teacherB.id }, // GV B dạy thay
    { ...a, date: "2026-01-20", status: "planned" }, // đã qua ngày, chưa điểm danh
    { ...a, date: "2026-01-27", status: "planned" }, // chưa tới ngày
    { ...a, date: "2026-01-08", status: "cancelled" },
    { ...a, date: "2026-02-03", status: "done" }, // ngoài tháng 1
    { classId: f.classB.id, teacherId: f.teacherB.id, date: "2026-01-07", startTime: "14:00", endTime: "15:00", status: "done" },
    { classId: f.classB.id, teacherId: null, date: "2026-01-09", startTime: "14:00", endTime: "15:00", status: "done" }, // chưa phân công
  ]);
});

describe("chấm công giáo viên", () => {
  it("tính công cho người thực dạy theo khoảng ngày; bỏ buổi hủy; tách buổi chưa điểm danh và chưa tới ngày", async () => {
    const { rows, summary } = await teacherTimesheet(f.admin, january, now);
    expect(rows).toHaveLength(5);
    expect(summary).toEqual([
      { teacherId: f.teacherA.id, teacherCode: "GVA", teacherName: "Giáo viên A", taught: 1, substitute: 0, minutes: 90, pending: 1, upcoming: 1 },
      { teacherId: f.teacherB.id, teacherCode: "GVB", teacherName: "Giáo viên B", taught: 2, substitute: 1, minutes: 150, pending: 0, upcoming: 0 },
    ]);
    expect(rows.filter((r) => r.teacherId === f.teacherA.id).map((r) => [r.date, r.state])).toEqual([
      ["2026-01-06", "taught"],
      ["2026-01-20", "pending"],
      ["2026-01-27", "upcoming"],
    ]);
  });

  it("lọc theo giáo viên và theo lớp (tính theo khóa)", async () => {
    const onlyB = await teacherTimesheet(f.admin, { ...january, teacherId: f.teacherB.id }, now);
    expect(onlyB.summary.map((s) => s.teacherCode)).toEqual(["GVB"]);
    expect(onlyB.rows.map((r) => [r.classCode, r.isSubstitute])).toEqual([["B", false], ["A", true]]);

    const course = await teacherTimesheet(f.admin, { from: f.classA.startDate, to: f.classA.endDate, classId: f.classA.id }, now);
    expect(course.summary.map((s) => [s.teacherCode, s.taught])).toEqual([["GVA", 2], ["GVB", 1]]);
  });

  it("chỉ Admin xem được", async () => {
    await expect(teacherTimesheet(f.actorA, january, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
