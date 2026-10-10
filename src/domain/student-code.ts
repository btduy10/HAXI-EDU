// Mã học viên tự cấp: HX + 2 số cuối của năm + số thứ tự trong năm (HX2601, HX2602, …).

export const STUDENT_CODE_PREFIX = "HX";

/** Phần đầu mã của một năm: 2026 → "HX26". */
export const studentCodeYearPrefix = (year: number) => `${STUDENT_CODE_PREFIX}${String(year % 100).padStart(2, "0")}`;

/**
 * Mã kế tiếp của năm `year`: số thứ tự lớn nhất đang có của năm đó cộng 1, tối thiểu 2 chữ số
 * (quá 99 thì thành HX26100). Mã không đúng mẫu (vd. HV001 nhập tay) được bỏ qua.
 */
export function nextStudentCode(existing: Iterable<string>, year: number): string {
  const prefix = studentCodeYearPrefix(year);
  let max = 0;
  for (const code of existing) {
    const upper = code.trim().toUpperCase();
    if (!upper.startsWith(prefix)) continue;
    const rest = upper.slice(prefix.length);
    if (/^\d{2,}$/.test(rest)) max = Math.max(max, Number(rest));
  }
  return `${prefix}${String(max + 1).padStart(2, "0")}`;
}
