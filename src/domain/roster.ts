import { SLOT_NAMES, SLOT_NAME_LABELS } from "@/lib/validation/entities";

// Bảng tổng quan Ghi danh theo buổi học trong tuần (buổi = ca + thứ, lấy từ Thời khóa biểu của tuần; không có thì từ lịch mẫu).

/** Số hàng tối thiểu của mỗi lớp trên bảng tổng quan; lớp đông hơn thì hiện đủ học viên. */
export const ROSTER_ROWS = 8;

const DAY_LABELS: Record<number, string> = { 1: "Thứ 2", 2: "Thứ 3", 3: "Thứ 4", 4: "Thứ 5", 5: "Thứ 6", 6: "Thứ 7", 7: "Chủ nhật" };
const EVENING = SLOT_NAMES[2];

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

/**
 * Thứ tự hiển thị các buổi: các buổi Tối từ Thứ 2 đến Chủ nhật trước,
 * rồi các buổi ban ngày theo thứ, trong ngày Sáng trước Chiều.
 */
export function rosterSessionOrder(slotName: string, weekday: number): number {
  const shift = (SLOT_NAMES as readonly string[]).indexOf(slotName);
  return (slotName === EVENING ? 0 : 100) + weekday * 10 + (shift < 0 ? 9 : shift);
}
