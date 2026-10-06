import { z } from "zod";

// Phân quyền theo vai trò, do Admin tick trong trang Cấu hình. Dùng chung cho máy chủ và giao diện.
// Admin luôn có toàn quyền. Xóa dữ liệu, Tài khoản, Nhật ký, Cấu hình luôn chỉ dành cho Admin.

export const MANAGED_ROLES = ["teacher", "duty_teacher"] as const;
export type ManagedRole = (typeof MANAGED_ROLES)[number];
export type UserRole = "admin" | ManagedRole;

export const PERMISSION_ACTIONS = ["view", "add", "edit"] as const;
export type PermissionAction = (typeof PERMISSION_ACTIONS)[number];
export const ACTION_LABELS: Record<PermissionAction, string> = { view: "Xem", add: "Thêm", edit: "Sửa" };

/** Các menu có thể mở cho Giáo viên / Giáo viên trực, theo đúng thứ tự trên thanh menu của Admin. */
export const PERMISSION_MENUS = [
  { key: "students", label: "Học viên", href: "/admin/students", actions: ["view", "add", "edit"], hint: "Không hiện số điện thoại, phụ huynh, ngày sinh, ghi chú." },
  { key: "teachers", label: "Giáo viên", href: "/admin/teachers", actions: ["view", "add", "edit"], hint: "" },
  { key: "courses", label: "Khóa học", href: "/admin/courses", actions: ["view", "add", "edit"], hint: "" },
  { key: "classes", label: "Lớp học", href: "/admin/classes", actions: ["view", "add", "edit"], hint: "Sửa gồm cả phân công giáo viên, lịch mẫu và sinh buổi học." },
  { key: "rooms", label: "Phòng & Ca học", href: "/admin/rooms-slots", actions: ["view", "add", "edit"], hint: "Gồm cả ngày nghỉ." },
  { key: "enrollments", label: "Ghi danh", href: "/admin/enrollments", actions: ["view", "add", "edit"], hint: "Thêm = ghi danh; Sửa = cho rời lớp." },
  { key: "timetable", label: "Thời khóa biểu", href: "/admin/timetable", actions: ["view", "add", "edit"], hint: "Thêm = xếp buổi, buổi bù; Sửa = sửa, dời, hủy, khôi phục, dạy thay." },
  { key: "attendance", label: "Điểm danh", href: "/admin/attendance", actions: ["view", "add", "edit"], hint: "Thêm = điểm danh buổi chưa điểm danh; Sửa = sửa điểm danh đã lưu." },
  { key: "stars", label: "Sao & Avatar", href: "/admin/stars", actions: ["view", "add", "edit"], hint: "Thêm = ghi sao; Sửa = hoàn tác sao, đổi avatar. Tiêu chí, cấp bậc, kho avatar chỉ Admin chỉnh." },
  { key: "rewards", label: "Quà & Tổng kết", href: "/admin/rewards", actions: ["view", "add", "edit"], hint: "Thêm = quà, mốc quà; Sửa = sửa quà, đóng lớp, duyệt và trao quà." },
  { key: "timesheet", label: "Chấm công", href: "/admin/timesheet", actions: ["view"], hint: "Phạm vi “lớp của mình” chỉ thấy công của chính mình." },
  { key: "reports", label: "Báo cáo", href: "/admin/reports", actions: ["view"], hint: "Gồm cả xuất Excel/PDF." },
] as const satisfies readonly { key: string; label: string; href: string; actions: readonly PermissionAction[]; hint: string }[];

export type Menu = (typeof PERMISSION_MENUS)[number]["key"];
export type ClassScope = "own" | "all";
export type MenuPermission = Record<PermissionAction, boolean>;
export type RolePermissions = { scope: ClassScope; menus: Record<Menu, MenuPermission> };
export type PermissionConfig = Record<ManagedRole, RolePermissions>;

export const ROLE_LABELS: Record<UserRole, string> = { admin: "Quản trị", teacher: "Giáo viên", duty_teacher: "Giáo viên trực" };
export const SCOPE_LABELS: Record<ClassScope, string> = { own: "Chỉ lớp của mình", all: "Tất cả lớp" };

const NONE: MenuPermission = { view: false, add: false, edit: false };
const FULL: MenuPermission = { view: true, add: true, edit: true };
const menusWith = (granted: Partial<Record<Menu, MenuPermission>>) =>
  Object.fromEntries(PERMISSION_MENUS.map((m) => [m.key, { ...(granted[m.key] ?? NONE) }])) as Record<Menu, MenuPermission>;

/** Mặc định: Giáo viên điểm danh và chấm sao lớp mình; Giáo viên trực thấy mọi lớp và hỗ trợ điểm danh. */
export const DEFAULT_PERMISSIONS: PermissionConfig = {
  teacher: { scope: "own", menus: menusWith({ attendance: FULL, stars: FULL }) },
  duty_teacher: { scope: "all", menus: menusWith({ attendance: FULL }) },
};

const menuPermission = z.object({ view: z.boolean(), add: z.boolean(), edit: z.boolean() });
const rolePermissions = z.object({
  scope: z.enum(["own", "all"]),
  menus: z.object(Object.fromEntries(PERMISSION_MENUS.map((m) => [m.key, menuPermission])) as Record<Menu, typeof menuPermission>),
});
export const permissionConfigInput = z.object({ teacher: rolePermissions, duty_teacher: rolePermissions });

/**
 * Chuẩn hóa cấu hình đọc từ CSDL hoặc gửi từ form: thiếu/sai thì lấy mặc định;
 * không có Xem thì không có Thêm/Sửa; bỏ các thao tác menu không hỗ trợ.
 */
export function normalizePermissions(value: unknown): PermissionConfig {
  const source = (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
  const out = {} as PermissionConfig;
  for (const role of MANAGED_ROLES) {
    const fallback = DEFAULT_PERMISSIONS[role];
    const raw = (source[role] && typeof source[role] === "object" ? source[role] : {}) as { scope?: unknown; menus?: Record<string, unknown> };
    const rawMenus = raw.menus && typeof raw.menus === "object" ? raw.menus : {};
    const menus = {} as Record<Menu, MenuPermission>;
    for (const menu of PERMISSION_MENUS) {
      const parsed = menuPermission.safeParse(rawMenus[menu.key]);
      const item = parsed.success ? parsed.data : fallback.menus[menu.key];
      const supported = menu.actions as readonly PermissionAction[];
      const view = item.view && supported.includes("view");
      menus[menu.key] = { view, add: view && item.add && supported.includes("add"), edit: view && item.edit && supported.includes("edit") };
    }
    out[role] = { scope: raw.scope === "own" || raw.scope === "all" ? raw.scope : fallback.scope, menus };
  }
  return out;
}
