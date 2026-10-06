import "server-only";
import { PERMISSION_MENUS } from "@/lib/permissions";
import { type Actor, can, isAdmin, seesAllClasses } from "./guard";

const ADMIN_ONLY = ["/admin/dashboard", "/admin/accounts", "/admin/audit", "/admin/settings"];

/**
 * Các mục menu người dùng được thấy. Admin: toàn bộ menu quản trị.
 * Vai trò khác: khu vực giảng dạy (luôn có) + các menu quản lý được tick "Xem" trong Cấu hình.
 * Đây chỉ là phần hiển thị; từng trang và service vẫn tự kiểm tra quyền.
 */
export function navFor(actor: Actor): { hrefs: string[]; labels: Record<string, string> } {
  const granted = PERMISSION_MENUS.filter((m) => can(actor, m.key, "view")).map((m) => m.href);
  if (isAdmin(actor)) return { hrefs: [...ADMIN_ONLY, ...granted], labels: {} };

  const hrefs = ["/teacher/dashboard", ...granted];
  const labels: Record<string, string> = {};
  const all = seesAllClasses(actor);
  // Được xem mọi lớp và đã có menu quản lý tương ứng thì không lặp lại mục của khu vực giảng dạy.
  if (!(all && can(actor, "timetable", "view"))) hrefs.push("/teacher/timetable");
  if (!(all && can(actor, "classes", "view"))) hrefs.push("/teacher/classes");
  if (all) {
    labels["/teacher/timetable"] = "Thời khóa biểu";
    labels["/teacher/classes"] = "Lớp học";
  }
  return { hrefs, labels };
}
