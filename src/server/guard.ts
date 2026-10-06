import { and, eq, or } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { classTeachers, classes, sessions } from "@/db/schema";
import {
  DEFAULT_PERMISSIONS,
  NO_PERMISSIONS,
  type Menu,
  type PermissionAction,
  type RolePermissions,
  type UserRole,
} from "@/lib/permissions";
import { AppError, forbidden, notFound } from "./errors";

// Người thực hiện thao tác, luôn lấy từ phiên ở máy chủ (không nhận từ client).
export type Actor = {
  userId: string;
  role: UserRole;
  teacherId: string | null;
  /** Quyền của vai trò, nạp từ Cấu hình cùng lúc với phiên. Thiếu thì dùng mặc định của vai trò (vai trò lạ: không có quyền gì). */
  perms?: RolePermissions;
};

export const isAdmin = (actor: Actor) => actor.role === "admin";

export function assertAdmin(actor: Actor) {
  if (!isAdmin(actor)) throw forbidden();
}

const permsOf = (actor: Actor): RolePermissions | null =>
  isAdmin(actor) ? null : (actor.perms ?? (Object.hasOwn(DEFAULT_PERMISSIONS, actor.role) ? DEFAULT_PERMISSIONS[actor.role]! : NO_PERMISSIONS));

/** Vai trò có được làm thao tác này ở menu này không (theo bảng tick trong Cấu hình). Admin luôn được. */
export function can(actor: Actor, menu: Menu, action: PermissionAction): boolean {
  const perms = permsOf(actor);
  return perms === null || perms.menus[menu]?.[action] === true;
}

export function assertCan(actor: Actor, menu: Menu, action: PermissionAction) {
  if (!can(actor, menu, action)) throw forbidden();
}

/** Được thao tác ở ít nhất một trong các quyền nêu ra. */
export function assertCanAny(actor: Actor, ...grants: [Menu, PermissionAction][]) {
  if (!grants.some(([menu, action]) => can(actor, menu, action))) throw forbidden();
}

/** Dữ liệu tham chiếu (khóa học, phòng, ca, ngày nghỉ): chỉ cần là người dùng đã đăng nhập. */
export function assertSignedIn(actor: Actor) {
  if (!actor.userId) throw unauthenticated();
}

/** Admin, hoặc vai trò được cấu hình phạm vi "Tất cả lớp". */
export const seesAllClasses = (actor: Actor) => permsOf(actor)?.scope !== "own";

/** Danh sách lớp trong phạm vi của người dùng. null = không giới hạn (Admin hoặc phạm vi "Tất cả lớp"). */
export async function allowedClassIds(actor: Actor, tx: DbOrTx = db): Promise<string[] | null> {
  if (seesAllClasses(actor)) return null;
  if (!actor.teacherId) return [];
  const rows = await tx
    .select({ classId: classTeachers.classId })
    .from(classTeachers)
    .where(eq(classTeachers.teacherId, actor.teacherId));
  return rows.map((r) => r.classId);
}

/**
 * Chống IDOR: GV chỉ truy cập lớp mình được phân công.
 * Trả NOT_FOUND thay vì FORBIDDEN để không lộ sự tồn tại của lớp khác.
 */
export async function assertClassAccess(actor: Actor, classId: string, tx: DbOrTx = db) {
  if (seesAllClasses(actor)) return;
  if (!actor.teacherId) throw notFound("lớp học");
  const [row] = await tx
    .select({ id: classTeachers.id })
    .from(classTeachers)
    .where(and(eq(classTeachers.classId, classId), eq(classTeachers.teacherId, actor.teacherId)))
    .limit(1);
  if (!row) throw notFound("lớp học");
}

/** GV được vào buổi học nếu thuộc lớp, hoặc là GV dạy/dạy thay của chính buổi đó. */
export async function assertSessionAccess(actor: Actor, sessionId: string, tx: DbOrTx = db) {
  if (seesAllClasses(actor)) return;
  if (!actor.teacherId) throw notFound("buổi học");
  const [row] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .leftJoin(
      classTeachers,
      and(eq(classTeachers.classId, sessions.classId), eq(classTeachers.teacherId, actor.teacherId)),
    )
    .where(
      and(
        eq(sessions.id, sessionId),
        or(
          eq(classTeachers.teacherId, actor.teacherId),
          eq(sessions.teacherId, actor.teacherId),
          eq(sessions.substituteTeacherId, actor.teacherId),
        ),
      ),
    )
    .limit(1);
  if (!row) throw notFound("buổi học");
}

export const unauthenticated = () => new AppError("UNAUTHENTICATED", "Vui lòng đăng nhập.");

/** Lớp đã đóng thì số liệu đã chốt: không điểm danh hay ghi/hoàn tác sao cho các buổi của lớp nữa. */
export async function assertClassOpen(classId: string, tx: DbOrTx = db) {
  const [cls] = await tx.select({ status: classes.status }).from(classes).where(eq(classes.id, classId)).limit(1);
  if (cls?.status !== "open") throw new AppError("CONFLICT", "Lớp đã đóng và đã chốt tổng kết nên không thay đổi được nữa.");
}