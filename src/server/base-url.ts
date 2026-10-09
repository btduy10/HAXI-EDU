/**
 * Địa chỉ chính của trang. Ưu tiên BETTER_AUTH_URL; nếu chưa đặt thì lấy địa chỉ production
 * do nền tảng cung cấp (Vercel: VERCEL_PROJECT_PRODUCTION_URL không kèm giao thức; Netlify: URL).
 */
export function resolveBaseUrl(): string | undefined {
  if (process.env.BETTER_AUTH_URL) return process.env.BETTER_AUTH_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return process.env.URL;
}
