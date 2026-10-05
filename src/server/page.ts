import "server-only";
import { notFound } from "next/navigation";
import { AppError } from "./errors";

/** Trong trang: lỗi không tìm thấy / không có quyền của service hiển thị thành trang 404. */
export async function orNotFound<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof AppError && (e.code === "NOT_FOUND" || e.code === "FORBIDDEN")) notFound();
    throw e;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Tham số đường dẫn phải là UUID, nếu không trả 404 (tránh lỗi ép kiểu ở CSDL). */
export function uuidParam(value: string): string {
  if (!UUID.test(value)) notFound();
  return value;
}
