import type { z } from "zod";
import { studentInput } from "@/lib/validation/entities";

// Quy tắc thuần cho nhập học viên từ Excel: ánh xạ cột, chuẩn hóa, kiểm tra từng dòng.

export const IMPORT_COLUMNS = [
  { key: "code", header: "Mã HV" },
  { key: "fullName", header: "Họ tên" },
  { key: "birthDate", header: "Ngày sinh" },
  { key: "gender", header: "Giới tính" },
  { key: "schoolGrade", header: "Khối lớp" },
  { key: "guardianName", header: "Phụ huynh" },
  { key: "phone", header: "Điện thoại" },
  { key: "note", header: "Ghi chú" },
] as const;

export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export type ImportKey = (typeof IMPORT_COLUMNS)[number]["key"];
export type RawImportRow = { rowNumber: number; cells: Partial<Record<ImportKey, unknown>> };
export type StudentImportData = z.output<typeof studentInput>;
export type ImportRowResult = {
  rowNumber: number;
  code: string;
  fullName: string;
  errors: string[];
  data: StudentImportData | null;
};

const GENDERS: Record<string, "male" | "female" | "other"> = {
  nam: "male",
  male: "male",
  nu: "female",
  "nữ": "female",
  female: "female",
  khac: "other",
  "khác": "other",
  other: "other",
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Nhận Date của Excel, "dd/mm/yyyy" hoặc "yyyy-mm-dd"; trả "yyyy-mm-dd", "" nếu trống, null nếu sai. */
export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
  }
  const text = String(value).trim();
  if (text === "") return "";
  const dmy = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
  if (dmy) return `${dmy[3]}-${pad(Number(dmy[2]))}-${pad(Number(dmy[1]))}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

const cellText = (value: unknown) => (value === null || value === undefined ? "" : String(value).trim());

const FIELD_LABELS: Record<string, string> = Object.fromEntries(IMPORT_COLUMNS.map((c) => [c.key, c.header]));

/**
 * Kiểm tra từng dòng. `existingCodes` là các mã đã có trong CSDL (viết hoa).
 * Dòng lỗi có `data = null` và danh sách lỗi cụ thể để hiển thị xem trước.
 */
export function validateImportRows(rows: RawImportRow[], existingCodes: ReadonlySet<string>): ImportRowResult[] {
  const seen = new Set<string>();
  return rows.map(({ rowNumber, cells }) => {
    const errors: string[] = [];
    const birthDate = normalizeDate(cells.birthDate);
    if (birthDate === null) errors.push("Ngày sinh: không đúng định dạng dd/mm/yyyy");
    const genderText = cellText(cells.gender).toLowerCase();
    const gender = genderText === "" ? "" : GENDERS[genderText];
    if (gender === undefined) errors.push("Giới tính: chỉ nhận Nam, Nữ hoặc Khác");

    const parsed = studentInput.safeParse({
      code: cellText(cells.code),
      fullName: cellText(cells.fullName),
      birthDate: birthDate ?? "",
      gender: gender ?? "",
      schoolGrade: cellText(cells.schoolGrade),
      guardianName: cellText(cells.guardianName),
      phone: cellText(cells.phone),
      note: cellText(cells.note),
      status: "active",
    });
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        const field = String(issue.path[0] ?? "");
        errors.push(`${FIELD_LABELS[field] ?? field}: ${issue.message}`);
      }
    }

    const code = cellText(cells.code).toUpperCase();
    if (code) {
      if (seen.has(code)) errors.push("Mã HV: bị lặp trong tệp");
      else if (existingCodes.has(code)) errors.push("Mã HV: đã tồn tại trong hệ thống");
      seen.add(code);
    }

    return {
      rowNumber,
      code,
      fullName: cellText(cells.fullName),
      errors,
      data: errors.length === 0 && parsed.success ? parsed.data : null,
    };
  });
}
