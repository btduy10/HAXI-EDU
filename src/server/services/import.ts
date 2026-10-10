import ExcelJS from "exceljs";
import { IMPORT_MAX_BYTES, IMPORT_MAX_ROWS } from "@/domain/excel-import";
import { AppError } from "../errors";

// Đọc tệp Excel tải lên (dùng cho nhập Syllabus).

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

/**
 * Đọc trang tính đầu tiên của tệp Excel theo dòng tiêu đề: mỗi dòng dữ liệu thành `{ rowNumber, cells }`.
 * `required` = các cột bắt buộc phải có trong dòng tiêu đề; dòng trống bị bỏ qua.
 */
export async function parseWorkbook<K extends string>(
  bytes: Uint8Array,
  columns: readonly { key: K; header: string }[],
  required: readonly K[],
  missingHeaderMessage: string,
): Promise<{ rowNumber: number; cells: Partial<Record<K, unknown>> }[]> {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer);
  } catch {
    throw new AppError("VALIDATION", "Không đọc được tệp Excel.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new AppError("VALIDATION", "Tệp không có trang tính nào.");

  const columnOf = new Map<K, number>();
  sheet.getRow(1).eachCell((cell, col) => {
    const match = columns.find((c) => normalizeHeader(c.header) === normalizeHeader(cellValue(cell.value)));
    if (match) columnOf.set(match.key, col);
  });
  if (required.some((key) => !columnOf.has(key))) throw new AppError("VALIDATION", missingHeaderMessage);

  const rows: { rowNumber: number; cells: Partial<Record<K, unknown>> }[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cells: Partial<Record<K, unknown>> = {};
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
