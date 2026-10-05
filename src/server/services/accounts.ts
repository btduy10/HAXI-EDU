import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { account, session, teachers, twoFactor, user } from "@/db/schema";
import type { accountInput } from "@/lib/validation/entities";
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
