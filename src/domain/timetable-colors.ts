// Màu nền theo giáo viên trên Thời khóa biểu: một tông xanh ngọc, chỉ khác độ đậm.
// Giáo viên xếp theo mã (người đầu nhạt nhất), các mức chia đều.

const HUE = 185;
/** Độ sáng (OKLCH) của mức nhạt nhất và đậm nhất dành cho giáo viên; chữ navy trên cả khoảng này đạt tương phản AA. */
export const TEACHER_LIGHTEST = 0.93;
export const TEACHER_DARKEST = 0.74;

/** Độ sáng của giáo viên thứ `index` (từ 0) trong `count` giáo viên. Chỉ một giáo viên thì lấy mức giữa. */
export function teacherLightness(index: number, count: number): number {
  if (count <= 1) return (TEACHER_LIGHTEST + TEACHER_DARKEST) / 2;
  const step = (TEACHER_LIGHTEST - TEACHER_DARKEST) / (count - 1);
  const position = Math.min(Math.max(index, 0), count - 1);
  return Math.round((TEACHER_LIGHTEST - step * position) * 1000) / 1000;
}

/** Màu nền CSS của giáo viên thứ `index`; càng đậm thì màu càng rõ sắc xanh. */
export function teacherShade(index: number, count: number): string {
  const lightness = teacherLightness(index, count);
  const chroma = Math.round((0.045 + (TEACHER_LIGHTEST - lightness) * 0.25) * 1000) / 1000;
  return `oklch(${lightness} ${chroma} ${HUE})`;
}
