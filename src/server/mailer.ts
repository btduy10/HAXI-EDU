import "server-only";
import nodemailer from "nodemailer";
import { AppError } from "./errors";

export type MailMessage = { to: string; subject: string; text: string; html: string };

function smtpConfig() {
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  if (!user || !pass) return null;
  const port = Number(process.env.SMTP_PORT ?? 465);
  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.gmail.com",
    port,
    // Cổng 465 mã hóa ngay từ đầu; cổng khác (587) bắt buộc nâng lên TLS trước khi đăng nhập.
    secure: port === 465,
    requireTLS: port !== 465,
    auth: { user, pass },
    from: process.env.MAIL_FROM?.trim() || `HAXI STEM <${user}>`,
  };
}

export const isMailConfigured = () => smtpConfig() !== null;

/** Báo lỗi sớm khi chưa khai báo SMTP, trước khi thay đổi dữ liệu. */
export function assertMailConfigured() {
  if (!isMailConfigured()) {
    throw new AppError("CONFLICT", "Chưa cấu hình gửi email. Khai báo SMTP_USER và SMTP_PASS cho máy chủ (xem README) rồi thử lại.");
  }
}

/** Gửi một thư qua SMTP. Không ghi địa chỉ nhận hay nội dung thư vào log. */
export async function sendMail(message: MailMessage) {
  assertMailConfigured();
  const { from, ...transport } = smtpConfig()!;
  try {
    await nodemailer
      .createTransport({ ...transport, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000 })
      .sendMail({ from, to: message.to, subject: message.subject, text: message.text, html: message.html });
  } catch (e) {
    const code = (e as { code?: unknown } | null)?.code;
    console.error("[mail] Gửi thư thất bại:", typeof code === "string" ? code : "unknown");
    throw new AppError(
      "CONFLICT",
      code === "EAUTH"
        ? "Máy chủ thư từ chối đăng nhập. Kiểm tra SMTP_USER và SMTP_PASS (mật khẩu ứng dụng)."
        : "Không gửi được email. Kiểm tra cấu hình SMTP và địa chỉ nhận rồi thử lại.",
    );
  }
}
