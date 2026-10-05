import { and, eq, or } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { classTeachers, sessions } from "@/db/schema";
import { AppError, forbidden, notFound } from "./errors";

// Người thực hiện thao tác, luôn lấy từ phiên ở máy chủ (không nhận từ client).
export type Actor = {
  userId: string;
  role: "admin" | "teacher";
  teacherId: string | null;
};

export const isAdmin = (actor: Actor) => actor.role === "admin";

export function assertAdmin(actor: Actor) {
  if (!isAdmin(actor)) throw forbidden();
}

/** Danh sách lớp GV được phân công. Admin trả về null (= không giới hạn). */
export async function allowedClassIds(actor: Actor, tx: DbOrTx = db): Promise<string[] | null> {
  if (isAdmin(actor)) return null;
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
  if (isAdmin(actor)) return;
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
  if (isAdmin(actor)) return;
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
