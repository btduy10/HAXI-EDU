import ExcelJS from "exceljs";
import { asc, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, sessions, syllabusLessons } from "@/db/schema";
import { DEFAULT_PERMISSIONS, type Menu, type MenuPermission } from "@/lib/permissions";
import type { Actor } from "@/server/guard";
import * as attendance from "@/server/services/attendance";
import * as svc from "@/server/services/syllabus";
import { type Fixture, resetDb, seedFixture } from "./helpers";

let f: Fixture;
const FULL: MenuPermission = { view: true, add: true, edit: true };
const withPerms = (actor: Actor, menus: Partial<Record<Menu, MenuPermission>>): Actor => ({
  ...actor,
  perms: { scope: "own", menus: { ...DEFAULT_PERMISSIONS.teacher!.menus, ...menus } },
});
const lesson = (classId: string, period: number, title: string, subjectCode = "ROB") => ({ classId, subjectCode, period, title });

async function workbook(rows: (string | number)[][], header = ["Lớp", "Mã môn", "Tiết", "Tên bài"]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Syllabus");
  sheet.addRow(header);
  for (const row of rows) sheet.addRow(row);
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  return { name: "syllabus.xlsx", size: bytes.byteLength, bytes };
}

beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

describe("syllabus", () => {
  it("thêm, sửa, xóa bài theo quyền menu Syllabus và phạm vi lớp; không trùng Lớp + Mã môn + Tiết", async () => {
    // Giáo viên mặc định không có quyền menu Syllabus.
    await expect(svc.listSyllabus(f.actorA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.createLesson(f.actorA, lesson(f.classA.id, 1, "X"))).rejects.toMatchObject({ code: "FORBIDDEN" });

    const first = await svc.createLesson(f.admin, lesson(f.classA.id, 2, "Lắp ráp khung xe"));
    await svc.createLesson(f.admin, lesson(f.classA.id, 1, "Làm quen với robot"));
    await svc.createLesson(f.admin, lesson(f.classB.id, 1, "Bài của lớp B"));
    await expect(svc.createLesson(f.admin, lesson(f.classA.id, 2, "Trùng tiết"))).rejects.toMatchObject({
      code: "VALIDATION",
      fieldErrors: { period: "Lớp này đã có bài ở Mã môn và Tiết đó." },
    });
    // Khác mã môn thì cùng tiết vẫn được.
    await svc.createLesson(f.admin, lesson(f.classA.id, 2, "Bài AI", "AI"));

    expect((await svc.listSyllabus(f.admin, { classId: f.classA.id })).map((l) => [l.subjectCode, l.period, l.title])).toEqual([
      ["ROB", 1, "Làm quen với robot"],
      ["AI", 2, "Bài AI"],
      ["ROB", 2, "Lắp ráp khung xe"],
    ]);

    // Người có quyền Syllabus trong phạm vi lớp mình: chỉ thấy và sửa được bài của lớp mình; xóa chỉ Admin.
    const editor = withPerms(f.actorA, { syllabus: FULL });
    expect((await svc.listSyllabus(editor)).every((l) => l.classCode === "A")).toBe(true);
    await svc.updateLesson(editor, first.id, lesson(f.classA.id, 2, "Lắp ráp khung xe (sửa)"));
    await expect(svc.createLesson(editor, lesson(f.classB.id, 9, "Lớp khác"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.updateLesson(editor, first.id, lesson(f.classB.id, 9, "Chuyển lớp"))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.deleteLesson(editor, first.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await svc.deleteLesson(f.admin, first.id);
    expect(await db.select().from(syllabusLessons).where(eq(syllabusLessons.id, first.id))).toHaveLength(0);
  });

  it("nhập Excel: xem trước báo lỗi từng dòng; ghi thêm mới và cập nhật bài đã có; chỉ Admin", async () => {
    await svc.createLesson(f.admin, lesson(f.classA.id, 1, "Tên cũ"));
    const file = await workbook([
      ["A", "ROB", 1, "Tên mới của tiết 1"],
      ["a", "ROB", 2, "Bài 2"],
      ["KHONG-CO", "ROB", 1, "Lớp không tồn tại"],
      ["B", "", "ba", ""],
      ["A", "rob", 2, "Lặp trong tệp"],
      ["B", "ROB", 1, "Bài của lớp B"],
    ]);
    await expect(svc.previewSyllabusImport(withPerms(f.actorA, { syllabus: FULL }), file)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const preview = await svc.previewSyllabusImport(f.admin, file);
    expect([preview.validCount, preview.errorCount]).toEqual([3, 3]);
    const byRow = Object.fromEntries(preview.rows.map((r) => [r.rowNumber, r.errors.join(" | ")]));
    expect(byRow[4]).toContain('Không có lớp mã "KHONG-CO"');
    expect(byRow[5]).toMatch(/Thiếu Mã môn/);
    expect(byRow[5]).toMatch(/Tiết phải là số nguyên/);
    expect(byRow[5]).toMatch(/Thiếu Tên bài/);
    expect(byRow[6]).toContain("Trùng Lớp + Mã môn + Tiết");

    const result = await svc.commitSyllabusImport(f.admin, file);
    expect([result.inserted, result.updated]).toEqual([2, 1]);
    const all = await db.select().from(syllabusLessons).orderBy(asc(syllabusLessons.period), asc(syllabusLessons.title));
    expect(all.map((l) => [l.classId === f.classA.id ? "A" : "B", l.period, l.title])).toEqual([
      ["B", 1, "Bài của lớp B"],
      ["A", 1, "Tên mới của tiết 1"],
      ["A", 2, "Bài 2"],
    ]);
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.tableName, "syllabus_lessons")).orderBy(asc(auditLogs.createdAt)).offset(1);
    expect(log).toMatchObject({ action: "import", newValue: { inserted: 2, updated: 1 } });

    // Thiếu cột tiêu đề thì từ chối cả tệp; tệp mẫu đọc lại được.
    await expect(svc.previewSyllabusImport(f.admin, await workbook([["A", "ROB", 1]], ["Lớp", "Mã môn", "Tiết"]))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const template = await svc.buildSyllabusTemplate(f.admin);
    const sample = await svc.previewSyllabusImport(f.admin, { name: "mau-syllabus.xlsx", size: template.byteLength, bytes: template });
    expect(sample.errorCount).toBe(0);
    await expect(svc.buildSyllabusTemplate(f.actorA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("điểm danh: chỉ hiện bài của lớp của buổi; lưu nội dung là tên bài kèm nhận xét của giáo viên", async () => {
    await svc.createLesson(f.admin, lesson(f.classA.id, 1, "Làm quen với robot"));
    await svc.createLesson(f.admin, lesson(f.classB.id, 1, "Bài của lớp B"));
    const [session] = await db
      .insert(sessions)
      .values({ classId: f.classA.id, date: "2026-01-13", startTime: "08:00", endTime: "09:30", teacherId: f.teacherA.id })
      .returning();
    const now = new Date("2026-01-13T05:00:00Z");

    // Giáo viên của lớp không có quyền menu Syllabus vẫn thấy bài của lớp mình để chọn.
    const sheet = await attendance.getAttendanceSheet(f.actorA, session!.id, now);
    expect(sheet.lessons).toEqual([{ subjectCode: "ROB", period: 1, title: "Làm quen với robot" }]);
    expect(sheet.teacherRemark).toBe("");

    const entries = sheet.rows.map((r) => ({ studentId: r.studentId, status: "present" as const, note: null }));
    await attendance.saveAttendance(
      f.actorA,
      { sessionId: session!.id, content: "Tiết 1 – Làm quen với robot", remark: "Lớp học tốt, cần thêm pin.", entries },
      now,
    );
    const [saved] = await db.select().from(sessions).where(eq(sessions.id, session!.id));
    expect(saved).toMatchObject({ status: "done", content: "Tiết 1 – Làm quen với robot", teacherRemark: "Lớp học tốt, cần thêm pin." });
    expect((await attendance.getAttendanceSheet(f.actorA, session!.id, now)).teacherRemark).toBe("Lớp học tốt, cần thêm pin.");

    // Không gửi nhận xét thì giữ nguyên; gửi rỗng thì xóa.
    await attendance.saveAttendance(f.actorA, { sessionId: session!.id, content: null, entries }, now);
    expect((await db.select().from(sessions).where(eq(sessions.id, session!.id)))[0]!.teacherRemark).toBe("Lớp học tốt, cần thêm pin.");
    await attendance.saveAttendance(f.actorA, { sessionId: session!.id, content: null, remark: null, entries }, now);
    expect((await db.select().from(sessions).where(eq(sessions.id, session!.id)))[0]!.teacherRemark).toBeNull();
  });
});
