import ExcelJS from "exceljs";
import { and, asc, eq, inArray } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { classes, syllabusLessons } from "@/db/schema";
import { SYLLABUS_COLUMNS, type SyllabusKey, type SyllabusRowResult, validateSyllabusRows } from "@/domain/syllabus-import";
import type { syllabusInput } from "@/lib/validation/entities";
import { audit } from "../audit";
import { AppError, notFound, translateDbError } from "../errors";
import { type Actor, allowedClassIds, assertAdmin, assertCan, assertClassAccess } from "../guard";
import { deleteRow } from "./crud";
import { type ImportUpload, assertXlsxUpload, parseWorkbook } from "./import";

// Syllabus: danh sách bài học (Mã môn + Tiết + Tên bài) của từng lớp. Giáo viên chọn tên bài khi điểm danh.

const DUPLICATE = "Lớp này đã có bài ở Mã môn và Tiết đó.";

/** Bài học trong phạm vi lớp của người xem, sắp theo lớp → mã môn → tiết. */
export async function listSyllabus(actor: Actor, filters: { classId?: string | null } = {}) {
  assertCan(actor, "syllabus", "view");
  const allowed = await allowedClassIds(actor);
  if (allowed && allowed.length === 0) return [];
  const conditions = [];
  if (allowed) conditions.push(inArray(syllabusLessons.classId, allowed));
  if (filters.classId) conditions.push(eq(syllabusLessons.classId, filters.classId));
  return db
    .select({
      id: syllabusLessons.id,
      classId: syllabusLessons.classId,
      classCode: classes.code,
      className: classes.name,
      subjectCode: syllabusLessons.subjectCode,
      period: syllabusLessons.period,
      title: syllabusLessons.title,
    })
    .from(syllabusLessons)
    .innerJoin(classes, eq(classes.id, syllabusLessons.classId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(classes.code), asc(syllabusLessons.subjectCode), asc(syllabusLessons.period));
}

/**
 * Bài học của một lớp để chọn khi điểm danh. Không kiểm tra quyền menu Syllabus:
 * nơi gọi đã bảo đảm người dùng vào được buổi học của lớp này.
 */
export async function lessonsForClass(classId: string) {
  return db
    .select({ subjectCode: syllabusLessons.subjectCode, period: syllabusLessons.period, title: syllabusLessons.title })
    .from(syllabusLessons)
    .where(eq(syllabusLessons.classId, classId))
    .orderBy(asc(syllabusLessons.subjectCode), asc(syllabusLessons.period));
}

async function assertNoDuplicate(data: z.output<typeof syllabusInput>, exceptId?: string) {
  const [dup] = await db
    .select({ id: syllabusLessons.id })
    .from(syllabusLessons)
    .where(and(eq(syllabusLessons.classId, data.classId), eq(syllabusLessons.subjectCode, data.subjectCode), eq(syllabusLessons.period, data.period)))
    .limit(1);
  if (dup && dup.id !== exceptId) throw new AppError("VALIDATION", DUPLICATE, { period: DUPLICATE });
}

export async function createLesson(actor: Actor, data: z.output<typeof syllabusInput>) {
  assertCan(actor, "syllabus", "add");
  await assertClassAccess(actor, data.classId);
  await assertNoDuplicate(data);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx.insert(syllabusLessons).values(data).returning();
      await audit(tx, { userId: actor.userId, action: "create", tableName: "syllabus_lessons", recordId: row!.id, newValue: row });
      return row!;
    });
  } catch (e) {
    throw translateDbError(e);
  }
}

export async function updateLesson(actor: Actor, id: string, data: z.output<typeof syllabusInput>) {
  assertCan(actor, "syllabus", "edit");
  const [before] = await db.select().from(syllabusLessons).where(eq(syllabusLessons.id, id)).limit(1);
  if (!before) throw notFound("bài học");
  // Phải vào được cả lớp cũ lẫn lớp mới (khi chuyển bài sang lớp khác).
  await assertClassAccess(actor, before.classId);
  await assertClassAccess(actor, data.classId);
  await assertNoDuplicate(data, id);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .update(syllabusLessons)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(syllabusLessons.id, id))
        .returning();
      await audit(tx, { userId: actor.userId, action: "update", tableName: "syllabus_lessons", recordId: id, oldValue: before, newValue: row });
      return row!;
    });
  } catch (e) {
    throw translateDbError(e);
  }
}

export const deleteLesson = (actor: Actor, id: string) => deleteRow(actor, syllabusLessons, "syllabus_lessons", id);

// ---------- Nhập từ Excel (chỉ Admin) ----------

export type SyllabusPreview = { rows: SyllabusRowResult[]; validCount: number; errorCount: number };

export async function previewSyllabusImport(actor: Actor, file: ImportUpload): Promise<SyllabusPreview> {
  assertAdmin(actor);
  assertXlsxUpload(file);
  const raw = await parseWorkbook<SyllabusKey>(
    file.bytes,
    SYLLABUS_COLUMNS,
    SYLLABUS_COLUMNS.map((c) => c.key),
    'Dòng tiêu đề phải có đủ 4 cột "Lớp", "Mã môn", "Tiết", "Tên bài". Hãy dùng tệp mẫu.',
  );
  const all = await db.select({ id: classes.id, code: classes.code }).from(classes);
  const rows = validateSyllabusRows(raw, new Map(all.map((c) => [c.code.trim().toLowerCase(), c.id])));
  const validCount = rows.filter((r) => r.data).length;
  return { rows, validCount, errorCount: rows.length - validCount };
}

/** Ghi các dòng hợp lệ: đã có cùng Lớp + Mã môn + Tiết thì cập nhật tên bài, chưa có thì thêm. Dòng lỗi bị bỏ qua. */
export async function commitSyllabusImport(actor: Actor, file: ImportUpload): Promise<SyllabusPreview & { inserted: number; updated: number }> {
  const preview = await previewSyllabusImport(actor, file);
  const valid = preview.rows.flatMap((r) => (r.data ? [r.data] : []));
  if (valid.length === 0) throw new AppError("VALIDATION", "Không có dòng hợp lệ nào để nhập.");
  let inserted = 0;
  let updated = 0;
  try {
    await db.transaction(async (tx) => {
      const existing = await tx
        .select({ classId: syllabusLessons.classId, subjectCode: syllabusLessons.subjectCode, period: syllabusLessons.period })
        .from(syllabusLessons)
        .where(inArray(syllabusLessons.classId, [...new Set(valid.map((v) => v.classId))]));
      const have = new Set(existing.map((e) => `${e.classId}|${e.subjectCode}|${e.period}`));
      for (const row of valid) {
        if (have.has(`${row.classId}|${row.subjectCode}|${row.period}`)) updated++;
        else inserted++;
        await tx
          .insert(syllabusLessons)
          .values(row)
          .onConflictDoUpdate({
            target: [syllabusLessons.classId, syllabusLessons.subjectCode, syllabusLessons.period],
            set: { title: row.title, updatedAt: new Date() },
          });
      }
      await audit(tx, { userId: actor.userId, action: "import", tableName: "syllabus_lessons", newValue: { inserted, updated } });
    });
  } catch (e) {
    throw translateDbError(e);
  }
  return { ...preview, inserted, updated };
}

/** Tệp mẫu nhập Syllabus; `classCode` điền sẵn mã một lớp có thật để người dùng dễ làm theo. */
export async function buildSyllabusTemplate(actor: Actor): Promise<Uint8Array> {
  assertAdmin(actor);
  const [sample] = await db.select({ code: classes.code }).from(classes).orderBy(asc(classes.code)).limit(1);
  const classCode = sample?.code ?? "MÃ LỚP";
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Syllabus");
  sheet.columns = SYLLABUS_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.key === "title" ? 50 : 16 }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({ classCode, subjectCode: "ROB", period: 1, title: "Làm quen với robot" });
  sheet.addRow({ classCode, subjectCode: "ROB", period: 2, title: "Lắp ráp khung xe" });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
