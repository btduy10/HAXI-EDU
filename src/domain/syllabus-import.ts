// Nhập Syllabus từ Excel: kiểm tra từng dòng, không chạm CSDL (mã lớp hợp lệ do nơi gọi truyền vào).

export const SYLLABUS_COLUMNS = [
  { key: "classCode", header: "Lớp" },
  { key: "subjectCode", header: "Mã môn" },
  { key: "period", header: "Tiết" },
  { key: "title", header: "Tên bài" },
] as const;

export type SyllabusKey = (typeof SYLLABUS_COLUMNS)[number]["key"];
export type RawSyllabusRow = { rowNumber: number; cells: Partial<Record<SyllabusKey, unknown>> };
export type SyllabusRowData = { classId: string; subjectCode: string; period: number; title: string };
export type SyllabusRowResult = {
  rowNumber: number;
  classCode: string;
  subjectCode: string;
  period: string;
  title: string;
  errors: string[];
  data: SyllabusRowData | null;
};

const text = (value: unknown) => String(value ?? "").trim().replace(/\s+/g, " ");

/**
 * Kiểm tra từng dòng. `classIdByCode`: mã lớp (đã chuẩn hóa chữ thường) → id lớp.
 * Hai dòng cùng Lớp + Mã môn + Tiết trong một tệp: dòng sau bị báo lỗi.
 */
export function validateSyllabusRows(rows: RawSyllabusRow[], classIdByCode: ReadonlyMap<string, string>): SyllabusRowResult[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const classCode = text(row.cells.classCode);
    const subjectCode = text(row.cells.subjectCode);
    const periodText = text(row.cells.period);
    const title = text(row.cells.title);
    const errors: string[] = [];

    const classId = classIdByCode.get(classCode.toLowerCase());
    if (!classCode) errors.push("Thiếu Lớp");
    else if (!classId) errors.push(`Không có lớp mã "${classCode}"`);
    if (!subjectCode) errors.push("Thiếu Mã môn");
    else if (subjectCode.length > 30) errors.push("Mã môn tối đa 30 ký tự");
    const period = Number(periodText);
    if (!periodText) errors.push("Thiếu Tiết");
    else if (!Number.isInteger(period) || period < 1 || period > 999) errors.push("Tiết phải là số nguyên từ 1 đến 999");
    if (!title) errors.push("Thiếu Tên bài");
    else if (title.length > 200) errors.push("Tên bài tối đa 200 ký tự");

    if (errors.length === 0) {
      const key = `${classId}|${subjectCode.toLowerCase()}|${period}`;
      if (seen.has(key)) errors.push("Trùng Lớp + Mã môn + Tiết với một dòng phía trên");
      seen.add(key);
    }
    const data = errors.length === 0 ? { classId: classId!, subjectCode, period, title } : null;
    return { rowNumber: row.rowNumber, classCode, subjectCode, period: periodText, title, errors, data };
  });
}
