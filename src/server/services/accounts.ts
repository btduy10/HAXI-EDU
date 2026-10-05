import { randomUUID } from "node:crypto";
import { and, asc, count, eq, ne } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { account, session, teachers, twoFactor, user } from "@/db/schema";
import type { accountEditInput, accountInput } from "@/lib/validation/entities";
import { audit } from "../audit";
import { AppError, notFound, translateDbError } from "../errors";
import { type Actor, assertAdmin } from "../guard";
import { hashPassword } from "../password";

const LOCKED_FOREVER = new Date("9999-12-31T00:00:00Z");

export async function listAccounts(actor: Actor) {
  assertAdmin(actor);
  return db
    .select({
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role,
      teacherId: user.teacherId,
      teacherName: teachers.fullName,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
    })
    .from(user)
    .leftJoin(teachers, eq(teachers.id, user.teacherId))
    .orderBy(asc(user.role), asc(user.username));
}

/** Tạo tài khoản với mật khẩu tạm; người dùng bắt buộc đổi ở lần đăng nhập đầu. */
export async function createAccount(actor: Actor, data: z.output<typeof accountInput>) {
  assertAdmin(actor);
  const passwordHash = await hashPassword(data.password);
  const id = randomUUID();
  try {
    return await db.transaction(async (tx) => {
      await tx.insert(user).values({
        id,
        name: data.name,
        username: data.username,
        displayUsername: data.username,
        // Better Auth yêu cầu email; hệ thống không dùng email nên sinh địa chỉ nội bộ.
        email: `${data.username}@haxi.local`,
        role: data.role,
        teacherId: data.role === "teacher" ? data.teacherId : null,
        mustChangePassword: true,
      });
      await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash });
      await audit(tx, {
        userId: actor.userId,
        action: "account_created",
        tableName: "user",
        recordId: id,
        newValue: { username: data.username, role: data.role, teacherId: data.teacherId },
      });
      return { id };
    });
  } catch (e) {
    const err = translateDbError(e);
    if (err instanceof AppError && err.code === "CONFLICT") {
      throw new AppError("CONFLICT", "Tên đăng nhập đã tồn tại.", { username: "Tên đăng nhập đã tồn tại" });
    }
    throw err;
  }
}

/**
 * Admin sửa tài khoản: tên đăng nhập, tên hiển thị, vai trò, giáo viên gắn kèm.
 * Đổi vai trò hoặc tên đăng nhập sẽ thu hồi mọi phiên của tài khoản đó.
 */
export async function updateAccount(actor: Actor, data: z.output<typeof accountEditInput>) {
  assertAdmin(actor);
  try {
    return await db.transaction(async (tx) => {
      const [before] = await tx.select().from(user).where(eq(user.id, data.id)).for("update").limit(1);
      if (!before) throw notFound("tài khoản");
      const teacherId = data.role === "teacher" ? data.teacherId : null;

      if (before.role !== data.role) {
        if (data.id === actor.userId) throw new AppError("CONFLICT", "Không thể tự đổi vai trò của chính mình.", { role: "Không tự đổi được" });
        if (before.role === "admin") {
          // Luôn phải còn ít nhất một quản trị viên khác.
          const [others] = await tx.select({ n: count() }).from(user).where(and(eq(user.role, "admin"), ne(user.id, data.id)));
          if ((others?.n ?? 0) === 0) throw new AppError("CONFLICT", "Phải còn ít nhất một tài khoản quản trị.");
        }
      }
      if (teacherId) {
        const [taken] = await tx.select({ id: user.id }).from(user).where(and(eq(user.teacherId, teacherId), ne(user.id, data.id))).limit(1);
        if (taken) throw new AppError("CONFLICT", "Giáo viên này đã có tài khoản khác.", { teacherId: "Đã có tài khoản khác" });
      }

      const [after] = await tx
        .update(user)
        .set({
          name: data.name,
          username: data.username,
          displayUsername: data.username,
          email: `${data.username}@haxi.local`,
          role: data.role,
          teacherId,
          updatedAt: new Date(),
        })
        .where(eq(user.id, data.id))
        .returning();
      const sensitive = before.role !== data.role || before.username !== data.username || before.teacherId !== teacherId;
      if (sensitive) await tx.delete(session).where(and(eq(session.userId, data.id), ne(session.userId, actor.userId)));
      const pick = (u: typeof before) => ({ username: u.username, name: u.name, role: u.role, teacherId: u.teacherId });
      await audit(tx, {
        userId: actor.userId,
        action: "account_updated",
        tableName: "user",
        recordId: data.id,
        oldValue: pick(before),
        newValue: pick(after!),
      });
      return { id: data.id };
    });
  } catch (e) {
    const err = translateDbError(e);
    if (err instanceof AppError && err.message.startsWith("Dữ liệu bị trùng")) {
      throw new AppError("CONFLICT", "Tên đăng nhập đã tồn tại.", { username: "Tên đăng nhập đã tồn tại" });
    }
    throw err;
  }
}
/** Admin đặt lại mật khẩu tạm: thu hồi mọi phiên và buộc đổi mật khẩu. */
export async function resetAccountPassword(actor: Actor, userId: string, newPassword: string) {
  assertAdmin(actor);
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (updated.length === 0) throw notFound("tài khoản");
    await tx.update(user).set({ mustChangePassword: true, failedAttempts: 0, updatedAt: new Date() }).where(eq(user.id, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await audit(tx, { userId: actor.userId, action: "account_password_reset", tableName: "user", recordId: userId });
  });
}

export async function setAccountLocked(actor: Actor, userId: string, locked: boolean) {
  assertAdmin(actor);
  if (locked && userId === actor.userId) throw new AppError("CONFLICT", "Không thể tự khóa tài khoản của chính mình.");
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(user)
      .set({ lockedUntil: locked ? LOCKED_FOREVER : null, failedAttempts: 0, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (updated.length === 0) throw notFound("tài khoản");
    if (locked) await tx.delete(session).where(eq(session.userId, userId));
    await audit(tx, {
      userId: actor.userId,
      action: locked ? "account_locked" : "account_unlocked",
      tableName: "user",
      recordId: userId,
    });
  });
}

/** Xóa thiết lập 2FA (khi mất thiết bị). Admin sẽ bị buộc thiết lập lại ở lần đăng nhập sau. */
export async function resetAccountTwoFactor(actor: Actor, userId: string) {
  assertAdmin(actor);
  if (userId === actor.userId) throw new AppError("CONFLICT", "Không thể tự đặt lại 2FA của chính mình.");
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(user)
      .set({ twoFactorEnabled: false, updatedAt: new Date() })
      .where(eq(user.id, userId))
      .returning({ id: user.id });
    if (updated.length === 0) throw notFound("tài khoản");
    await tx.delete(twoFactor).where(eq(twoFactor.userId, userId));
    await tx.delete(session).where(eq(session.userId, userId));
    await audit(tx, { userId: actor.userId, action: "account_2fa_reset", tableName: "user", recordId: userId });
  });
}
