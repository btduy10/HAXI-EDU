export type AppErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND" | "VALIDATION" | "CONFLICT" | "RATE_LIMITED";

export class AppError extends Error {
  constructor(
    public readonly code: AppErrorCode,
    message: string,
    public readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const forbidden = () => new AppError("FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.");
export const notFound = (what = "dữ liệu") => new AppError("NOT_FOUND", `Không tìm thấy ${what}.`);

export const HTTP_STATUS: Record<AppErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  VALIDATION: 400,
  CONFLICT: 409,
  RATE_LIMITED: 429,
};

// Lỗi ràng buộc của Postgres (driver có thể bọc trong `cause`).
function pgCode(e: unknown): string | undefined {
  for (let cur = e as { code?: unknown; cause?: unknown } | undefined, i = 0; cur && i < 4; cur = cur.cause as typeof cur, i++) {
    if (typeof cur.code === "string" && /^[0-9A-Z]{5}$/.test(cur.code)) return cur.code;
  }
  return undefined;
}

export function translateDbError(e: unknown): unknown {
  switch (pgCode(e)) {
    case "23505":
      return new AppError("CONFLICT", "Dữ liệu bị trùng (mã hoặc tên đã tồn tại).");
    case "23503":
      return new AppError("CONFLICT", "Không thể thực hiện vì dữ liệu đang được sử dụng ở nơi khác.");
    case "23514":
      return new AppError("VALIDATION", "Dữ liệu không hợp lệ.");
    default:
      return e;
  }
}
