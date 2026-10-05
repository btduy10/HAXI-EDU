import ExcelJS from "exceljs";
import { db } from "@/db";
import { students } from "@/db/schema";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  type ImportKey,
  type ImportRowResult,
  type RawImportRow,
  validateImportRows,
} from "@/domain/student-import";
import { audit } from "../audit";
import { AppError, translateDbError } from "../errors";
import { type Actor, assertAdmin } from "../guard";

export type ImportUpload = { name: string; size: number; bytes: Uint8Array };

const normalizeHeader = (v: unknown) => String(v ?? "").trim().toLowerCase();

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (value instanceof Date || typeof value !== "object") return value;
  // Ô công thức / rich text / siêu liên kết: lấy phần văn bản hiển thị.
  if ("result" in value) return value.result ?? "";
  if ("richText" in value) return value.richText.map((r) => r.text).join("");
  if ("text" in value) return value.text;
  return "";
}

/** Kiểm tra loại và dung lượng tệp trước khi đọc nội dung. */
export function assertXlsxUpload(file: ImportUpload) {
  if (!file.name.toLowerCase().endsWith(".xlsx")) throw new AppError("VALIDATION", "Chỉ nhận tệp Excel định dạng .xlsx.");
  if (file.size === 0 || file.size > IMPORT_MAX_BYTES) throw new AppError("VALIDATION", "Tệp phải nhỏ hơn 2 MB.");
  // .xlsx là tệp ZIP: 4 byte đầu là "PK\x03\x04".
  const b = file.bytes;
  if (!(b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04)) {
    throw new AppError("VALIDATION", "Nội dung tệp không phải Excel hợp lệ.");
  }
}

export async function parseStudentWorkbook(bytes: Uint8Array): Promise<RawImportRow[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new AppError("VALIDATION", "Không đọc được tệp Excel.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError("VALIDATION", "Tệp không có trang tính nào.");

  const columnOf = new Map<ImportKey, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const match = IMPORT_COLUMNS.find((c) => normalizeHeader(c.header) === normalizeHeader(cellValue(cell.value)));
    if (match) columnOf.set(match.key, col);
  });
  if (!columnOf.has("code") || !columnOf.has("fullName")) {
    throw new AppError("VALIDATION", 'Dòng tiêu đề phải có cột "Mã HV" và "Họ tên". Hãy dùng tệp mẫu.');
  }

  const rows: RawImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: RawImportRow["cells"] = {};
    let hasValue = false;
    for (const [key, col] of columnOf) {
      const value = cellValue(row.getCell(col).value);
      cells[key] = value;
      if (value !== "") hasValue = true;
    }
    if (hasValue) rows.push({ rowNumber, cells });
  });
  if (rows.length === 0) throw new AppError("VALIDATION", "Tệp không có dòng dữ liệu nào.");
  if (rows.length > IMPORT_MAX_ROWS) throw new AppError("VALIDATION", `Mỗi lần nhập tối đa ${IMPORT_MAX_ROWS} dòng.`);
  return rows;
}

export type ImportPreview = { rows: ImportRowResult[]; validCount: number; errorCount: number };

export async function previewStudentImport(actor: Actor, file: ImportUpload): Promise<ImportPreview> {
  assertAdmin(actor);
  assertXlsxUpload(file);
  const raw = await parseStudentWorkbook(file.bytes);
  const existing = await db.select({ code: students.code }).from(students);
  const rows = validateImportRows(raw, new Set(existing.map((s) => s.code.toUpperCase())));
  const validCount = rows.filter((r) => r.data).length;
  return { rows, validCount, errorCount: rows.length - validCount };
}

/** Chỉ ghi các dòng hợp lệ; dòng lỗi bị bỏ qua và trả về để hiển thị. */
export async function commitStudentImport(actor: Actor, file: ImportUpload): Promise<ImportPreview & { inserted: number }> {
  const preview = await previewStudentImport(actor, file);
  const valid = preview.rows.flatMap((r) => (r.data ? [r.data] : []));
  if (valid.length === 0) throw new AppError("VALIDATION", "Không có dòng hợp lệ nào để nhập.");
  try {
    await db.transaction(async (tx) => {
      const inserted = await tx.insert(students).values(valid).returning({ id: students.id });
      await audit(tx, {
        userId: actor.userId,
        action: "import",
        tableName: "students",
        newValue: { count: inserted.length },
      });
    });
  } catch (e) {
    throw translateDbError(e);
  }
  return { ...preview, inserted: valid.length };
}

export async function buildStudentTemplate(): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Học viên");
  sheet.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: 20 }));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow({
    code: "HV101",
    fullName: "Nguyễn Văn Mẫu",
    birthDate: "15/08/2015",
    gender: "Nam",
    schoolGrade: 5,
    guardianName: "Nguyễn Văn Bố",
    phone: "0901234567",
    note: "",
  });
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}
