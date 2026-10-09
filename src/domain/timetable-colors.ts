// Màu nền theo giáo viên trên Thời khóa biểu: ba tông theo màu thương hiệu (vàng, xanh dương, xanh ngọc).
// Giáo viên xếp theo mã, lần lượt nhận từng tông nên hai người liền mã luôn khác tông;
// hết ba tông thì quay vòng với mức đậm hơn.

/** `chroma`: độ rực ở mức nhạt nhất; `gain`: độ rực tăng thêm theo độ đậm (giữ màu trong dải sRGB). */
const TONES = [
  { hue: 75, chroma: 0.075, gain: 0.32 },
  { hue: 255, chroma: 0.045, gain: 0.39 },
  { hue: 185, chroma: 0.065, gain: 0.29 },
] as const;

/** Số tông màu; mỗi vòng `TEACHER_TONES` giáo viên dùng chung một độ đậm. */
export const TEACHER_TONES = TONES.length;
/** Độ sáng (OKLCH) của vòng nhạt nhất và đậm nhất; chữ navy trên cả khoảng này đạt tương phản AA. */
export const TEACHER_LIGHTEST = 0.9;
export const TEACHER_DARKEST = 0.76;

/** Màu của lớp chỉ hiển thị trên Thời khóa biểu (vd. cho mượn phòng): xám trung tính, không lẫn với màu của giáo viên. */
export const TIMETABLE_ONLY_SHADE = "oklch(0.87 0.008 255)";

const clampIndex = (index: number, count: number) => Math.min(Math.max(index, 0), Math.max(count - 1, 0));

/** Độ sáng của giáo viên thứ `index` (từ 0) trong `count` giáo viên. Chỉ một vòng thì lấy mức giữa. */
export function teacherLightness(index: number, count: number): number {
  const rounds = Math.ceil(count / TEACHER_TONES);
  if (rounds <= 1) return (TEACHER_LIGHTEST + TEACHER_DARKEST) / 2;
  const step = (TEACHER_LIGHTEST - TEACHER_DARKEST) / (rounds - 1);
  const round = Math.floor(clampIndex(index, count) / TEACHER_TONES);
  return Math.round((TEACHER_LIGHTEST - step * round) * 1000) / 1000;
}

/** Màu nền CSS của giáo viên thứ `index`; càng đậm thì màu càng rực. */
export function teacherShade(index: number, count: number): string {
  const tone = TONES[clampIndex(index, count) % TEACHER_TONES]!;
  const lightness = teacherLightness(index, count);
  const chroma = Math.round((tone.chroma + (TEACHER_LIGHTEST - lightness) * tone.gain) * 1000) / 1000;
  return `oklch(${lightness} ${chroma} ${tone.hue})`;
}
