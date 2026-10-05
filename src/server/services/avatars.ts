import { and, asc, eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { avatars, levels, studentAvatarGifts, students } from "@/db/schema";
import { isAvatarUnlocked } from "@/domain/stars";
import { audit } from "../audit";
import { AppError, notFound } from "../errors";
import { type Actor, assertAdmin } from "../guard";
import { assertStudentAccess, loadAvatars, progressOf, resyncAllAvatars } from "./stars";

// Kho avatar là bộ SVG có sẵn trong public/avatars. Admin chỉnh tên, cấp yêu cầu, bật/tắt và tặng riêng;
// không cho tải SVG mới lên (tránh XSS qua SVG).
export const AVATAR_CATALOG = [
  { file: "bolt", name: "Bu Lông", level: 1 },
  { file: "pico", name: "Pico", level: 1 },
  { file: "gizmo", name: "Gizmo", level: 1 },
  { file: "sprocket", name: "Bánh Răng", level: 2 },
  { file: "beep", name: "Bíp Bíp", level: 2 },
  { file: "visor", name: "Kính Thép", level: 2 },
  { file: "rotor", name: "Cánh Quạt", level: 3 },
  { file: "cyclo", name: "Mắt Thần", level: 3 },
  { file: "dj", name: "DJ Mạch", level: 4 },
  { file: "titan", name: "Titan", level: 4 },
  { file: "king", name: "Vua Robot", level: 5 },
  { file: "nova", name: "Nova", level: 5 },
  { file: "gift-blaze", name: "Lửa Thiêng", level: null },
  { file: "gift-champ", name: "Nhà Vô Địch", level: null },
  { file: "gift-buddy", name: "Bạn Tốt", level: null },
] as const;

/** Nạp kho avatar mặc định (chạy lại nhiều lần an toàn: bỏ qua avatar đã có theo svg_path). */
export async function ensureAvatarCatalog(tx: DbOrTx = db): Promise<number> {
  const levelRows = await tx.select().from(levels).orderBy(asc(levels.levelNo));
  if (levelRows.length === 0) return 0;
  const top = levelRows[levelRows.length - 1]!;
  const inserted = await tx
    .insert(avatars)
    .values(
      AVATAR_CATALOG.map((a) => ({
        name: a.name,
        svgPath: `/avatars/${a.file}.svg`,
        unlockType: a.level === null ? ("gifted" as const) : ("by_level" as const),
        // Nếu bảng cấp có ít bậc hơn mặc định thì gắn vào cấp cao nhất hiện có.
        requiredLevelId: a.level === null ? null : (levelRows.find((l) => l.levelNo === a.level) ?? top).id,
      })),
    )
    .onConflictDoNothing({ target: avatars.svgPath })
    .returning({ id: avatars.id });
  return inserted.length;
}

export async function listAvatarCatalog(actor: Actor) {
  assertAdmin(actor);
  return loadAvatars();
}

export async function updateAvatar(
  actor: Actor,
  id: string,
  data: { name: string; requiredLevelId: string | null; active: boolean },
) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(avatars).where(eq(avatars.id, id)).limit(1);
    if (!before) throw notFound("avatar");
    if (before.unlockType === "by_level" && !data.requiredLevelId) {
      throw new AppError("VALIDATION", "Avatar mở theo cấp phải có cấp yêu cầu.", { requiredLevelId: "Bắt buộc chọn" });
    }
    const requiredLevelId = before.unlockType === "gifted" ? null : data.requiredLevelId;
    if (data.active === false || requiredLevelId !== before.requiredLevelId) {
      // Luôn phải còn ít nhất một avatar cấp 1 đang bật để học viên nào cũng có avatar.
      const [first] = await tx.select().from(levels).orderBy(asc(levels.levelNo)).limit(1);
      const basics = await tx
        .select({ id: avatars.id })
        .from(avatars)
        .where(and(eq(avatars.requiredLevelId, first!.id), eq(avatars.active, true), eq(avatars.unlockType, "by_level")));
      const stillBasic = basics.some((b) => b.id !== id) || (data.active && requiredLevelId === first!.id);
      if (!stillBasic) throw new AppError("CONFLICT", "Phải còn ít nhất một avatar cấp 1 đang bật.");
    }
    const [row] = await tx.update(avatars).set({ name: data.name, requiredLevelId, active: data.active }).where(eq(avatars.id, id)).returning();
    await audit(tx, { userId: actor.userId, action: "update", tableName: "avatars", recordId: id, oldValue: before, newValue: row });
    // Tắt avatar hoặc nâng cấp yêu cầu có thể khóa avatar học viên đang dùng.
    await resyncAllAvatars(tx, actor);
    return row!;
  });
}

/** Admin tặng riêng một avatar cho học viên; avatar này không mất khi tụt cấp. */
export async function giftAvatar(actor: Actor, studentId: string, avatarId: string) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const [avatar] = await tx.select().from(avatars).where(eq(avatars.id, avatarId)).limit(1);
    if (!avatar || !avatar.active) throw notFound("avatar");
    if (avatar.unlockType !== "gifted") throw new AppError("VALIDATION", "Chỉ tặng được avatar thuộc loại tặng riêng.");
    const [student] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)).limit(1);
    if (!student) throw notFound("học viên");
    const [row] = await tx
      .insert(studentAvatarGifts)
      .values({ studentId, avatarId, giftedBy: actor.userId })
      .onConflictDoNothing()
      .returning();
    if (!row) throw new AppError("CONFLICT", "Học viên đã có avatar này.");
    await audit(tx, { userId: actor.userId, action: "avatar_gifted", tableName: "student_avatar_gifts", recordId: row.id, newValue: { studentId, avatarId } });
    return row;
  });
}

/** Đổi avatar cho học viên: chỉ GV của lớp (hoặc Admin), và chỉ avatar đã mở theo cấp hoặc được tặng. */
export async function setStudentAvatar(actor: Actor, studentId: string, avatarId: string) {
  await assertStudentAccess(actor, studentId);
  return db.transaction(async (tx) => {
    const [student] = await tx.select().from(students).where(eq(students.id, studentId)).for("update").limit(1);
    if (!student) throw notFound("học viên");
    const [progress, avatarList] = await Promise.all([progressOf(tx, [studentId]), loadAvatars(tx)]);
    const mine = progress.get(studentId)!;
    const avatar = avatarList.find((a) => a.id === avatarId);
    if (!avatar) throw notFound("avatar");
    if (!isAvatarUnlocked(avatar, mine.level.levelNo, new Set(mine.giftedAvatarIds))) {
      throw new AppError("CONFLICT", "Avatar này chưa mở khóa cho học viên.");
    }
    if (student.currentAvatarId === avatarId) return { avatarId };
    await tx.update(students).set({ currentAvatarId: avatarId, updatedAt: new Date() }).where(eq(students.id, studentId));
    await audit(tx, {
      userId: actor.userId,
      action: "avatar_changed",
      tableName: "students",
      recordId: studentId,
      oldValue: { currentAvatarId: student.currentAvatarId },
      newValue: { currentAvatarId: avatarId },
    });
    return { avatarId };
  });
}

/** Danh sách avatar tặng riêng đang bật + học viên đã nhận (cho trang tặng avatar của Admin). */
export async function listGiftedAvatars(actor: Actor) {
  assertAdmin(actor);
  const gifted = await db.select().from(avatars).where(and(eq(avatars.unlockType, "gifted"), eq(avatars.active, true))).orderBy(asc(avatars.name));
  const given =
    gifted.length === 0
      ? []
      : await db
          .select({
            id: studentAvatarGifts.id,
            avatarId: studentAvatarGifts.avatarId,
            studentName: students.fullName,
            studentCode: students.code,
            giftedAt: studentAvatarGifts.giftedAt,
          })
          .from(studentAvatarGifts)
          .innerJoin(students, eq(students.id, studentAvatarGifts.studentId))
          .where(inArray(studentAvatarGifts.avatarId, gifted.map((g) => g.id)))
          .orderBy(asc(students.fullName));
  return { gifted, given };
}
