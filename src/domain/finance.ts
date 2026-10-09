import { addDays, endOfMonth, startOfWeek } from "@/lib/dates";

// Báo cáo tài chính: chia khoảng thời gian thành các kỳ (tuần / tháng / năm) quanh một ngày mốc.

export const FINANCE_VIEWS = ["week", "month", "year"] as const;
export type FinanceView = (typeof FINANCE_VIEWS)[number];
export const FINANCE_VIEW_LABEL: Record<FinanceView, string> = { week: "Tuần", month: "Tháng", year: "Năm" };

/** Số kỳ hiển thị: 12 tuần gần nhất, 12 tháng của năm, 5 năm gần nhất. */
export const WEEK_COUNT = 12;
export const YEAR_COUNT = 5;

export type FinancePeriod = { key: string; label: string; title: string; from: string; to: string };

const dayMonth = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const vn = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/**
 * Các kỳ của báo cáo, cũ → mới:
 * - week: 12 tuần (Thứ Hai–Chủ nhật), tuần cuối là tuần chứa ngày mốc;
 * - month: 12 tháng của năm chứa ngày mốc;
 * - year: 5 năm, năm cuối là năm chứa ngày mốc.
 */
export function financePeriods(view: FinanceView, anchor: string): FinancePeriod[] {
  const year = Number(anchor.slice(0, 4));
  if (view === "week") {
    const last = startOfWeek(anchor);
    return Array.from({ length: WEEK_COUNT }, (_, i) => {
      const from = addDays(last, -7 * (WEEK_COUNT - 1 - i));
      const to = addDays(from, 6);
      return { key: from, label: dayMonth(from), title: `Tuần ${vn(from)} – ${vn(to)}`, from, to };
    });
  }
  if (view === "month") {
    return Array.from({ length: 12 }, (_, i) => {
      const from = `${year}-${String(i + 1).padStart(2, "0")}-01`;
      return { key: from.slice(0, 7), label: `T${i + 1}`, title: `Tháng ${i + 1}/${year}`, from, to: endOfMonth(from) };
    });
  }
  return Array.from({ length: YEAR_COUNT }, (_, i) => {
    const y = year - (YEAR_COUNT - 1 - i);
    return { key: String(y), label: String(y), title: `Năm ${y}`, from: `${y}-01-01`, to: `${y}-12-31` };
  });
}

/** Vị trí kỳ chứa một ngày (các kỳ liền nhau, không chồng lấn); -1 nếu nằm ngoài. */
export const periodIndexOf = (periods: FinancePeriod[], date: string) => periods.findIndex((p) => date >= p.from && date <= p.to);

/** Số tiền gọn cho trục biểu đồ: 600000 → "600k", 2500000 → "2,5 tr", 1200000000 → "1,2 tỷ". */
export function compactMoney(value: number): string {
  const abs = Math.abs(value);
  const fmt = (n: number) => n.toLocaleString("vi-VN", { maximumFractionDigits: 1 });
  if (abs >= 1_000_000_000) return `${fmt(value / 1_000_000_000)} tỷ`;
  if (abs >= 1_000_000) return `${fmt(value / 1_000_000)} tr`;
  if (abs >= 1_000) return `${fmt(value / 1_000)}k`;
  return fmt(value);
}
