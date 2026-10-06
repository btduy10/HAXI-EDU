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

/**
 * Trang buổi học ở khu vực giảng dạy: mở từ Thời khóa biểu (link kèm ?tkb=<ngày>) thì nút Quay lại về đúng tuần đó,
 * còn lại về Tổng quan. Chỉ nhận giá trị đúng dạng ngày để không tạo link tùy ý.
 */
export function teacherSessionBack(raw: string | string[] | undefined): { backHref: string; tabQuery: string } {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { backHref: "/teacher/dashboard", tabQuery: "" };
  return { backHref: `/teacher/timetable?date=${value}`, tabQuery: `?tkb=${value}` };
}
