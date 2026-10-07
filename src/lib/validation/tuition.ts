import { z } from "zod";
import { id, intIn, isoDate, optIntIn, optText, reqText } from "./common";

const MAX_MONEY = 1_000_000_000;

/** Đặt học phí của một lớp (đồng/học viên cho cả khóa); để trống = chưa đặt. */
export const classFeeInput = z.object({ classId: id, tuitionFee: optIntIn(0, MAX_MONEY) });

/** Giảm học phí riêng cho một lượt ghi danh. */
export const discountInput = z.object({ enrollmentId: id, discount: intIn(0, MAX_MONEY), reason: optText(200) });

/** Lập phiếu thu cho một lượt ghi danh. */
export const receiptInput = z.object({
  enrollmentId: id,
  amount: intIn(1, MAX_MONEY),
  method: z.enum(["cash", "transfer"], { error: "Chọn hình thức thanh toán" }),
  paidAt: isoDate,
  payerName: optText(100),
  note: optText(200),
});

export const cancelReceiptInput = z.object({ id, reason: reqText(200) });
