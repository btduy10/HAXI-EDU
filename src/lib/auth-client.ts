import { twoFactorClient, usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [usernameClient(), twoFactorClient()],
});

const MESSAGES: Record<string, string> = {
  INVALID_USERNAME_OR_PASSWORD: "Tên đăng nhập hoặc mật khẩu không đúng.",
  INVALID_PASSWORD: "Mật khẩu hiện tại không đúng.",
  ACCOUNT_LOCKED: "Tài khoản đang tạm khóa do đăng nhập sai nhiều lần. Vui lòng thử lại sau.",
  INVALID_CODE: "Mã xác thực không đúng.",
  INVALID_TWO_FACTOR_COOKIE: "Phiên xác thực đã hết hạn. Vui lòng đăng nhập lại.",
  TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE: "Bạn thử quá nhiều lần. Vui lòng đăng nhập lại.",
  PASSWORD_TOO_SHORT: "Mật khẩu quá ngắn.",
  PASSWORD_TOO_LONG: "Mật khẩu quá dài.",
};

/** Chuyển lỗi của Better Auth sang thông báo tiếng Việt. */
export function authErrorMessage(error: { code?: string; status?: number; message?: string } | null | undefined) {
  if (!error) return "Đã xảy ra lỗi. Vui lòng thử lại.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  if (error.status === 429) return "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít phút.";
  // Thông báo do hook phía máy chủ của hệ thống tự đặt (đã là tiếng Việt).
  if ((error.status === 403 || error.status === 400) && error.message && !error.code) return error.message;
  return "Đã xảy ra lỗi. Vui lòng thử lại.";
}
