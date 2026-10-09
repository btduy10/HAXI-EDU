import { randomUUID } from "node:crypto";
import { and, asc, count, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { db, type DbOrTx } from "@/db";
import { account, session, teachers, twoFactor, user } from "@/db/schema";
import { accountEmail } from "@/domain/account-email";
import type { accountEditInput, accountInput } from "@/lib/validation/entities";
import { audit } from "../audit";
import { resolveBaseUrl } from "../base-url";
import { AppError, notFound, translateDbError } from "../errors";
import { type Actor, assertAdmin } from "../guard";
import { assertMailConfigured, sendMail } from "../mailer";
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
      teacherEmail: teachers.email,
      mustChangePassword: user.mustChangePassword,
      twoFactorEnabled: user.twoFactorEnabled,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
    })
    .from(user)
    .leftJoin(teachers, eq(teachers.id, user.teacherId))
    .orderBy(asc(user.role), asc(user.username));
}

/** Vai trò của tài khoản là vai trò Admin chọn (Quản trị hoặc một vai trò ở Cấu hình → Phân quyền), kể cả khi gắn với giáo viên. */
async function roleFor(tx: DbOrTx, chosen: string) {
  await assertKnownRole(chosen, tx, true);
  return chosen;
}

/** Tạo tài khoản với mật khẩu tạm; người dùng bắt buộc đổi ở lần đăng nhập đầu. */
export async function createAccount(actor: Actor, data: z.output<typeof accountInput>) {
  assertAdmin(actor);
  const passwordHash = await hashPassword(data.password);
  const id = randomUUID();
  try {
    return await db.transaction(async (tx) => {
      const role = await roleFor(tx, data.role);
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
      const role = await roleFor(tx, data.role);

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
    await applyPasswordReset(tx, actor, userId, passwordHash, mustChange);
    await audit(tx, {
      userId: actor.userId,
      action: "account_password_reset",
      tableName: "user",
      recordId: userId,
      newValue: { mustChange },
    });
  });
}

/** Ghi mật khẩu mới (đã băm), gỡ khóa và thu hồi phiên của tài khoản. */
async function applyPasswordReset(tx: DbOrTx, actor: Actor, userId: string, passwordHash: string, mustChange: boolean) {
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
}

/**
 * Admin gửi thông tin đăng nhập qua email của giáo viên gắn với tài khoản (menu Giáo viên): tên đăng nhập,
 * mật khẩu tạm Admin vừa nhập và hướng dẫn đăng nhập. Mật khẩu đang lưu đã băm một chiều nên không đọc lại được:
 * gửi tức là đặt lại thành mật khẩu tạm này, thu hồi phiên và bắt đổi ở lần đăng nhập đầu.
 * Thư gửi trong giao dịch: gửi lỗi thì mật khẩu cũ giữ nguyên.
 */
export async function sendAccountCredentials(actor: Actor, userId: string, password: string) {
  assertAdmin(actor);
  const [target] = await db
    .select({ username: user.username, teacherId: user.teacherId, teacherName: teachers.fullName, teacherEmail: teachers.email })
    .from(user)
    .leftJoin(teachers, eq(teachers.id, user.teacherId))
    .where(eq(user.id, userId))
    .limit(1);
  if (!target?.username) throw notFound("tài khoản");
  if (!target.teacherId) {
    throw new AppError("CONFLICT", "Tài khoản chưa gắn với giáo viên nên chưa có email. Gắn giáo viên ở nút Sửa rồi thử lại.");
  }
  const to = z.email().safeParse(target.teacherEmail?.trim());
  if (!to.success) {
    throw new AppError("CONFLICT", `Giáo viên ${target.teacherName} chưa có email hợp lệ. Nhập email ở menu Giáo viên rồi thử lại.`);
  }
  const baseUrl = resolveBaseUrl();
  if (!baseUrl) throw new AppError("CONFLICT", "Chưa đặt địa chỉ trang (BETTER_AUTH_URL) nên chưa tạo được đường dẫn đăng nhập.");
  assertMailConfigured();

  const passwordHash = await hashPassword(password);
  const message = accountEmail({
    name: target.teacherName ?? target.username,
    username: target.username,
    password,
    loginUrl: new URL("/login", baseUrl).toString(),
  });
  await db.transaction(async (tx) => {
    await applyPasswordReset(tx, actor, userId, passwordHash, true);
    // Nhật ký không chứa mật khẩu và không chứa địa chỉ email.
    await audit(tx, {
      userId: actor.userId,
      action: "account_credentials_sent",
      tableName: "user",
      recordId: userId,
      newValue: { teacherId: target.teacherId },
    });
    await sendMail({ to: to.data, ...message });
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
