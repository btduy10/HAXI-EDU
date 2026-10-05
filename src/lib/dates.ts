// Tính toán ngày dạng chuỗi "yyyy-mm-dd" (không phụ thuộc múi giờ của máy chủ).

const toUtc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const fromUtc = (d: Date) => d.toISOString().slice(0, 10);

export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}

/** Thứ theo ISO: 1 = Thứ Hai … 7 = Chủ nhật. */
export function isoWeekday(iso: string): number {
  return toUtc(iso).getUTCDay() || 7;
}

export const startOfWeek = (iso: string) => addDays(iso, 1 - isoWeekday(iso));
export const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`;

export function addMonths(iso: string, months: number): string {
  const d = toUtc(startOfMonth(iso));
  d.setUTCMonth(d.getUTCMonth() + months);
  return fromUtc(d);
}

export function endOfMonth(iso: string): string {
  return addDays(addMonths(iso, 1), -1);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to).getTime() - toUtc(from).getTime()) / 86_400_000);
}

export function* eachDay(from: string, to: string): Generator<string> {
  for (let day = from; day <= to; day = addDays(day, 1)) yield day;
}

export const WEEKDAY_LABELS: Record<number, string> = {
  1: "Thứ Hai",
  2: "Thứ Ba",
  3: "Thứ Tư",
  4: "Thứ Năm",
  5: "Thứ Sáu",
  6: "Thứ Bảy",
  7: "Chủ nhật",
};
export const WEEKDAY_SHORT: Record<number, string> = { 1: "T2", 2: "T3", 3: "T4", 4: "T5", 5: "T6", 6: "T7", 7: "CN" };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Tham số ngày trên URL: trả về giá trị hợp lệ hoặc giá trị dự phòng. */
export function parseIsoDate(value: unknown, fallback: string): string {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return fallback;
  const d = toUtc(value);
  return Number.isNaN(d.getTime()) || fromUtc(d) !== value ? fallback : value;
}
