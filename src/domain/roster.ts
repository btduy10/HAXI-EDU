import { SLOT_NAMES, SLOT_NAME_LABELS } from "@/lib/validation/entities";

// Bảng tổng quan Ghi danh theo buổi học trong tuần (buổi = ca + thứ, lấy từ Thời khóa biểu của tuần; không có thì từ lịch mẫu).

/** Số hàng tối thiểu của mỗi lớp trên bảng tổng quan; lớp đông hơn thì hiện đủ học viên. */
export const ROSTER_ROWS = 8;

const DAY_LABELS: Record<number, string> = { 1: "Thứ 2", 2: "Thứ 3", 3: "Thứ 4", 4: "Thứ 5", 5: "Thứ 6", 6: "Thứ 7", 7: "Chủ nhật" };

/** Tên buổi: "Ca tối" + thứ 1 → "Tối Thứ 2"; thứ 7 của tuần là Chủ nhật. */
export function rosterSessionLabel(slotName: string, weekday: number): string {
  const shift = (SLOT_NAME_LABELS as Record<string, string>)[slotName] ?? slotName;
  return `${shift} ${DAY_LABELS[weekday] ?? ""}`.trim();
}

/** Giờ trên tiêu đề buổi: "19:00:00" → "19h00". */
export const rosterTime = (time: string) => time.slice(0, 5).replace(":", "h");

/** Ca của buổi xếp giờ tự do (không gắn ca), suy theo giờ bắt đầu: trước 12:00 là Sáng, trước 17:00 là Chiều, còn lại là Tối. */
export function shiftOfTime(startTime: string): (typeof SLOT_NAMES)[number] {
  return startTime < "12:00" ? SLOT_NAMES[0] : startTime < "17:00" ? SLOT_NAMES[1] : SLOT_NAMES[2];
}

const shiftIndex = (slotName: string) => (SLOT_NAMES as readonly string[]).indexOf(slotName);

/** Thứ tự hiển thị các buổi: theo từng ngày từ Thứ 2 đến Chủ nhật, trong ngày Sáng → Chiều → Tối. */
export function rosterSessionOrder(slotName: string, weekday: number): number {
  const shift = shiftIndex(slotName);
  return weekday * 10 + (shift < 0 ? 9 : shift);
}

// Màu theo buổi: mỗi thứ một tông (7 tông cách đều), mỗi ca lệch tông và đậm nhạt khác nhau,
// nên mỗi buổi (thứ + ca) có một màu riêng, cố định qua các tuần.
const HUE_START = 185;
const SHIFT_TINTS = [
  { offset: 120, lightness: 0.93, chroma: 0.05 }, // Sáng: nhạt
  { offset: 240, lightness: 0.9, chroma: 0.065 }, // Chiều
  { offset: 0, lightness: 0.87, chroma: 0.075 }, // Tối: đậm nhất
] as const;

/**
 * Màu của một buổi trên bảng tổng quan Ghi danh: `header` là nền tiêu đề khung (chữ navy đạt tương phản AA),
 * `accent` là viền trên cùng tông, đậm hơn. Các lớp cùng buổi dùng chung màu.
 */
export function rosterSessionShade(slotName: string, weekday: number): { header: string; accent: string } {
  const tint = SHIFT_TINTS[Math.max(shiftIndex(slotName), 0)]!;
  const hue = Math.round((HUE_START + ((weekday - 1) * 360) / 7 + tint.offset) % 360);
  return { header: `oklch(${tint.lightness} ${tint.chroma} ${hue})`, accent: `oklch(${Math.round((tint.lightness - 0.22) * 100) / 100} 0.12 ${hue})` };
}
