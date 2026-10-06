import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { classTeachers, sessions } from "@/db/schema";
import { teacherTimesheet, timesheetDoc } from "@/server/services/timesheet";
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
      { teacherId: f.teacherA.id, teacherCode: "GVA", teacherName: "Giáo viên A", taught: 1, substitute: 0, assistant: 0, minutes: 90, pending: 1, upcoming: 1, amount: 0, missingRate: 1 },
      { teacherId: f.teacherB.id, teacherCode: "GVB", teacherName: "Giáo viên B", taught: 2, substitute: 1, assistant: 0, minutes: 150, pending: 0, upcoming: 0, amount: 0, missingRate: 2 },
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

  it("tính công trợ giảng riêng và thành tiền theo lương/buổi của phân công", async () => {
    // GV A dạy chính lớp A 300.000đ/buổi; GV B trợ giảng lớp A 150.000đ/buổi (B dạy chính lớp B chưa nhập lương).
    await db.update(classTeachers).set({ ratePerSession: 300_000 }).where(eq(classTeachers.teacherId, f.teacherA.id));
    await db.insert(classTeachers).values({ classId: f.classA.id, teacherId: f.teacherB.id, role: "assistant", ratePerSession: 150_000 });
    await db.update(sessions).set({ assistantTeacherId: f.teacherB.id }).where(and(eq(sessions.classId, f.classA.id), eq(sessions.date, "2026-01-06")));

    const { rows, summary } = await teacherTimesheet(f.admin, january, now);
    const a = summary.find((s) => s.teacherId === f.teacherA.id)!;
    const b = summary.find((s) => s.teacherId === f.teacherB.id)!;
    expect(a).toMatchObject({ taught: 1, assistant: 0, amount: 300_000, missingRate: 0 });
    // B: dạy chính lớp B (chưa có lương), dạy thay lớp A ngày 13 (150.000 theo phân công ở lớp A), trợ giảng ngày 06.
    expect(b).toMatchObject({ taught: 2, substitute: 1, assistant: 1, amount: 300_000, missingRate: 1 });
    expect(rows.filter((r) => r.date === "2026-01-06").map((r) => [r.teacherCode, r.role, r.rate])).toEqual([
      ["GVA", "main", 300_000],
      ["GVB", "assistant", 150_000],
    ]);
    const onlyB = await teacherTimesheet(f.admin, { ...january, teacherId: f.teacherB.id }, now);
    expect(onlyB.rows.map((r) => r.role).sort()).toEqual(["assistant", "main", "substitute"]);
  });

  it("chỉ Admin xem được", async () => {
    await expect(teacherTimesheet(f.actorA, january, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("xuất chấm công", () => {
  it("tệp tổng hợp gồm mọi giáo viên kèm dòng tổng; tệp riêng chỉ có một giáo viên", async () => {
    const all = await timesheetDoc(f.admin, january, now);
    expect(all.filename).toBe("cham-cong-tong-hop-2026-01-01-2026-01-31");
    const [summary, detail] = all.sections;
    expect(summary!.columns.map((c) => c.header).slice(0, 3)).toEqual(["STT", "Mã GV", "Giáo viên"]);
    // GV A: 1 công; GV B: 2 công (1 dạy thay); dòng cuối là tổng cộng.
    expect(summary!.rows.map((r) => [r[1], r[3], r[4]])).toEqual([
      [f.teacherA.code, 1, 0],
      [f.teacherB.code, 2, 1],
      ["", 3, 1],
    ]);
    expect(detail!.columns.map((c) => c.header).slice(0, 3)).toEqual(["STT", "Thứ", "Ngày"]);
    expect(detail!.rows[0]!.slice(1, 3)).toEqual(["Thứ Ba", "06/01/2026"]);

    const own = await timesheetDoc(f.admin, { ...january, teacherId: f.teacherB.id }, now);
    expect(own.filename).toBe(`cham-cong-${f.teacherB.code}-2026-01-01-2026-01-31`);
    expect(own.sections[0]!.rows).toHaveLength(1);
    expect(new Set(own.sections[1]!.rows.map((r) => r[4]))).toEqual(new Set([f.teacherB.code]));
    // Vai trò Giáo viên mặc định không có menu Chấm công.
    await expect(timesheetDoc(f.actorA, january, now)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
