import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "./auth";
import { AppError } from "./errors";
import { type Actor, unauthenticated } from "./guard";

export type SessionUser = {
  id: string;
  name: string;
  username: string;
  role: "admin" | "teacher";
  teacherId: string | null;
  mustChangePassword: boolean;
  twoFactorEnabled: boolean;
};

/** Phiên hiện tại, đọc lại từ CSDL mỗi request (không cache cookie) để khóa/đổi quyền có hiệu lực ngay. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const result = await auth.api.getSession({ headers: await headers() });
  if (!result) return null;
  const u = result.user;
  return {
    id: u.id,
    name: u.name,
    username: u.username ?? "",
    role: u.role === "admin" ? "admin" : "teacher",
    teacherId: u.teacherId ?? null,
    mustChangePassword: u.mustChangePassword,
    twoFactorEnabled: Boolean(u.twoFactorEnabled),
  };
});

/** Bước bắt buộc còn thiếu trước khi được dùng hệ thống. */
export function pendingStep(user: SessionUser): "/change-password" | "/two-factor/setup" | null {
  if (user.mustChangePassword) return "/change-password";
  if (user.role === "admin" && !user.twoFactorEnabled) return "/two-factor/setup";
  return null;
}

export const homeOf = (user: SessionUser) => (user.role === "admin" ? "/admin/dashboard" : "/teacher/dashboard");

/** Dùng trong Server Action / Route Handler: ném lỗi thay vì chuyển hướng. */
export async function requireActor(): Promise<Actor> {
  const user = await getSessionUser();
  if (!user) throw unauthenticated();
  if (user.mustChangePassword) throw new AppError("FORBIDDEN", "Bạn cần đổi mật khẩu trước khi tiếp tục.");
  if (user.role === "admin" && !user.twoFactorEnabled) {
    throw new AppError("FORBIDDEN", "Quản trị viên cần bật xác thực hai lớp trước khi tiếp tục.");
  }
  return { userId: user.id, role: user.role, teacherId: user.teacherId };
}

/** Dùng trong trang/layout: chuyển hướng khi chưa đủ điều kiện. */
export async function requirePageUser(role?: "admin" | "teacher"): Promise<SessionUser & { actor: Actor }> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const step = pendingStep(user);
  if (step) redirect(step);
  if (role && user.role !== role) redirect(homeOf(user));
  return { ...user, actor: { userId: user.id, role: user.role, teacherId: user.teacherId } };
}
