import { randomUUID } from "node:crypto";
import { and, asc, count, eq, ne, sql } from "drizzle-orm";
import type { z } from "zod";
import { db, type DbOrTx } from "@/db";
import { account, session, teachers, twoFactor, user } from "@/db/schema";
import { type accountPermissionsInput, normalizeRolePermissions } from "@/lib/permissions";
import type { accountEditInput, accountInput } from "@/lib/validation/entities";
import { audit } from "../audit";
import { AppError, notFound, translateDbError } from "../errors";
import { type Actor, assertAdmin } from "../guard";
import { hashPassword } from "../password";
import { assertKnownRole } from "../settings";

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
      customPermissions: sql<boolean>`${user.customPermissions} is not null`,
    })
    .from(user)
    .leftJoin(teachers, eq(teachers.id, user.teacherId))
    .orderBy(asc(user.role), asc(user.username));
}

/**
 * Tài khoản gắn với một giáo viên lấy vai trò theo cột Vai trò của giáo viên đó (menu Giáo viên).
 * Quản trị và tài khoản không gắn giáo viên giữ vai trò đã chọn.
 */
async function roleFor(tx: DbOrTx, chosen: string, teacherId: string | null) {
  await assertKnownRole(chosen, tx, true);
  if (chosen === "admin" || !teacherId) return chosen;
  const [teacher] = await tx.select({ role: teachers.role }).from(teachers).where(eq(teachers.id, teacherId)).limit(1);
  return teacher?.role ?? chosen;
}

/** Tạo tài khoản với mật khẩu tạm; người dùng bắt buộc đổi ở lần đăng nhập đầu. */
export async function createAccount(actor: Actor, data: z.output<typeof accountInput>) {
  assertAdmin(actor);
  const passwordHash = await hashPassword(data.password);
  const id = randomUUID();
  try {
    return await db.transaction(async (tx) => {
      const role = await roleFor(tx, data.role, data.teacherId);
      await tx.insert(user).values({
        id,
        name: data.name,
        username: data.username,
        displayUsername: data.username,
        // Better Auth yêu cầu email; hệ thống không dùng email nên sinh địa chỉ nội bộ.
        email: `${data.username}@haxi.local`,
        role,
        teacherId: data.role === "admin" ? null : data.teacherId,
        mustChangePassword: true,
      });
      await tx.insert(account).values({ id: randomUUID(), accountId: id, providerId: "credential", userId: id, password: passwordHash });
      await audit(tx, {
        userId: actor.userId,
        action: "account_created",
        tableName: "user",
        recordId: id,
        newValue: { username: data.username, role, teacherId: data.teacherId },
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
      const teacherId = data.role === "admin" ? null : data.teacherId;
      const role = await roleFor(tx, data.role, teacherId);

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
          role,
          teacherId,
          updatedAt: new Date(),
        })
        .where(eq(user.id, data.id))
        .returning();
      const sensitive = before.role !== role || before.username !== data.username || before.teacherId !== teacherId;
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
/**
 * Admin đặt lại mật khẩu của bất kỳ tài khoản nào. Đồng thời gỡ khóa (nếu tài khoản đang bị khóa do nhập sai)
 * và thu hồi các phiên đăng nhập của tài khoản đó. `mustChange` = bắt đổi mật khẩu ở lần đăng nhập sau.
 */
export async function resetAccountPassword(actor: Actor, userId: string, newPassword: string, mustChange = true) {
  assertAdmin(actor);
  const passwordHash = await hashPassword(newPassword);
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
      .returning({ id: account.id });
    if (updated.length === 0) throw notFound("tài khoản");
    await tx
      .update(user)
      .set({ mustChangePassword: mustChange, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() })
      .where(eq(user.id, userId));
    // Admin tự đặt lại mật khẩu của mình thì giữ phiên hiện tại; tài khoản khác bị đăng xuất khỏi mọi thiết bị.
    if (userId !== actor.userId) await tx.delete(session).where(eq(session.userId, userId));
    await audit(tx, {
      userId: actor.userId,
      action: "account_password_reset",
      tableName: "user",
      recordId: userId,
      newValue: { mustChange },
    });
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

/**
 * Admin xóa hẳn một tài khoản (không xóa được chính mình, nên luôn còn ít nhất một quản trị viên).
 * Phiên đăng nhập, mật khẩu, 2FA của tài khoản bị xóa theo; điểm danh, sao, nhật ký đã ghi vẫn giữ nguyên
 * (cột người thực hiện để trống). Hồ sơ giáo viên gắn kèm không bị xóa.
 */
export async function deleteAccount(actor: Actor, userId: string) {
  assertAdmin(actor);
  if (userId === actor.userId) throw new AppError("CONFLICT", "Không thể tự xóa tài khoản của chính mình.");
  await db.transaction(async (tx) => {
    const [deleted] = await tx.delete(user).where(eq(user.id, userId)).returning();
    if (!deleted) throw notFound("tài khoản");
    await audit(tx, {
      userId: actor.userId,
      action: "account_deleted",
      tableName: "user",
      recordId: userId,
      oldValue: { username: deleted.username, name: deleted.name, role: deleted.role, teacherId: deleted.teacherId },
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

/** Cấu hình → Quyền riêng từng tài khoản: các tài khoản không phải Admin kèm vai trò và quyền riêng (null = theo vai trò). */
export async function listAccountPermissions(actor: Actor) {
  assertAdmin(actor);
  const rows = await db
    .select({ id: user.id, username: user.username, name: user.name, role: user.role, custom: user.customPermissions })
    .from(user)
    .where(ne(user.role, "admin"))
    .orderBy(asc(user.username));
  return rows.map(({ custom, ...row }) => ({ ...row, permissions: custom ? normalizeRolePermissions(custom) : null }));
}

/**
 * Admin bật quyền riêng cho một tài khoản (ghi đè quyền của vai trò, gồm cả phạm vi lớp) hoặc tắt (`null`) để quay về vai trò.
 * Không áp cho tài khoản Admin (luôn toàn quyền). Có hiệu lực ở yêu cầu kế tiếp của tài khoản đó.
 */
export async function updateAccountPermissions(actor: Actor, data: z.output<typeof accountPermissionsInput>) {
  assertAdmin(actor);
  const value = data.permissions ? normalizeRolePermissions(data.permissions) : null;
  await db.transaction(async (tx) => {
    const [before] = await tx.select({ role: user.role, custom: user.customPermissions }).from(user).where(eq(user.id, data.userId)).limit(1);
    if (!before) throw notFound("tài khoản");
    if (before.role === "admin") throw new AppError("CONFLICT", "Tài khoản quản trị luôn có toàn quyền, không cần phân quyền riêng.");
    await tx.update(user).set({ customPermissions: value, updatedAt: new Date() }).where(eq(user.id, data.userId));
    await audit(tx, {
      userId: actor.userId,
      action: "account_permissions_updated",
      tableName: "user",
      recordId: data.userId,
      oldValue: before.custom ?? null,
      newValue: value,
    });
  });
  return value;
}
