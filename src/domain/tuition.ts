/** unset = lớp chưa đặt học phí. */
export type TuitionStatus = "unset" | "unpaid" | "partial" | "paid";

export const TUITION_STATUS_LABEL: Record<TuitionStatus, string> = {
  unset: "Chưa đặt học phí",
  unpaid: "Chưa đóng",
  partial: "Đóng một phần",
  paid: "Đã đóng đủ",
};

export const PAYMENT_METHOD_LABEL = { cash: "Tiền mặt", transfer: "Chuyển khoản" } as const;

/** Phải đóng = học phí lớp − giảm; còn lại = phải đóng − đã đóng (không âm). */
export function tuitionBalance(fee: number | null, discount: number, paid: number) {
  const due = fee === null ? 0 : Math.max(0, fee - discount);
  const remaining = Math.max(0, due - paid);
  const status: TuitionStatus = fee === null ? "unset" : paid >= due ? "paid" : paid > 0 ? "partial" : "unpaid";
  return { due, remaining, status };
}

/** Số phiếu thu in trên giấy: PT-000123. */
export const receiptCode = (no: number) => `PT-${String(no).padStart(6, "0")}`;

const DIGITS = ["không", "một", "hai", "ba", "bốn", "năm", "sáu", "bảy", "tám", "chín"];
const UNITS = ["", " nghìn", " triệu", " tỷ"];

// Đọc một nhóm ba chữ số; `full` = có nhóm lớn hơn đứng trước nên phải đọc đủ "không trăm", "lẻ".
function readTriple(n: number, full: boolean): string {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  const parts: string[] = [];
  if (hundreds > 0 || full) parts.push(`${DIGITS[hundreds]} trăm`);
  if (tens > 1) {
    parts.push(`${DIGITS[tens]} mươi`);
    if (ones === 1) parts.push("mốt");
    else if (ones === 5) parts.push("lăm");
    else if (ones > 0) parts.push(DIGITS[ones]!);
  } else if (tens === 1) {
    parts.push("mười");
    if (ones === 5) parts.push("lăm");
    else if (ones > 0) parts.push(DIGITS[ones]!);
  } else if (ones > 0) {
    if (hundreds > 0 || full) parts.push("lẻ");
    parts.push(DIGITS[ones]!);
  }
  return parts.join(" ");
}

/** Đọc số tiền (đồng, số nguyên không âm) bằng chữ tiếng Việt: 1250000 → "Một triệu hai trăm năm mươi nghìn đồng". */
export function moneyInWords(amount: number): string {
  const value = Math.max(0, Math.floor(amount));
  if (value === 0) return "Không đồng";
  const groups: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 1000)) groups.push(rest % 1000);
  const words: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i] === 0) continue;
    words.push(`${readTriple(groups[i]!, i < groups.length - 1)}${UNITS[i] ?? ""}`);
  }
  const text = `${words.join(" ")} đồng`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}
