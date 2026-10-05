import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db, type DbOrTx, type Tx } from "@/db";
import {
  avatars,
  classTeachers,
  classes,
  enrollments,
  levels,
  sessions,
  starCriteria,
  starLogs,
  studentAvatarGifts,
  students,
  user,
} from "@/db/schema";
import { type AvatarRule, type Level, type Progress, canDeduct, progressFor, resolveAvatar, validateLevels } from "@/domain/stars";
import { todayIso } from "@/lib/format";
import type { awardInput, criteriaInput, levelInput } from "@/lib/validation/stars";
import { audit } from "../audit";
import { AppError, notFound } from "../errors";
import { type Actor, assertAdmin, assertClassOpen, assertSessionAccess, isAdmin } from "../guard";
import { getSettings } from "../settings";
import { sessionRoster } from "./attendance";
import { createRow, deleteRow, updateRow } from "./crud";
import { listClassStudents } from "./students";

// ---------- Dữ liệu nền: cấp bậc, avatar, tổng sao ----------

export async function loadLevels(tx: DbOrTx = db): Promise<Level[]> {
  return tx.select().from(levels).orderBy(asc(levels.levelNo));
}

export type AvatarInfo = AvatarRule & { svgPath: string; requiredLevelId: string | null; requiredMinStars: number | null };

export async function loadAvatars(tx: DbOrTx = db): Promise<AvatarInfo[]> {
  return tx
    .select({
      id: avatars.id,
      name: avatars.name,
      svgPath: avatars.svgPath,
      unlockType: avatars.unlockType,
      active: avatars.active,
      requiredLevelId: avatars.requiredLevelId,
      requiredLevelNo: levels.levelNo,
      requiredMinStars: levels.minStars,
    })
    .from(avatars)
    .leftJoin(levels, eq(levels.id, avatars.requiredLevelId))
    .orderBy(asc(avatars.unlockType), asc(levels.levelNo), asc(avatars.name));
}

/** Tổng sao THÔ toàn thời gian theo học viên (chưa chặn dưới 0); tính khi truy vấn, không lưu cứng. */
async function rawSums(tx: DbOrTx, studentIds: string[]): Promise<Map<string, number>> {
  const out = new Map(studentIds.map((id) => [id, 0]));
  if (studentIds.length === 0) return out;
  const rows = await tx
    .select({ studentId: starLogs.studentId, sum: sql<number>`coalesce(sum(${starLogs.stars}), 0)::int` })
    .from(starLogs)
    .where(inArray(starLogs.studentId, studentIds))
    .groupBy(starLogs.studentId);
  for (const row of rows) out.set(row.studentId, row.sum);
  return out;
}

async function giftedByStudent(tx: DbOrTx, studentIds: string[]): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>(studentIds.map((id) => [id, new Set()]));
  if (studentIds.length === 0) return out;
  const rows = await tx.select().from(studentAvatarGifts).where(inArray(studentAvatarGifts.studentId, studentIds));
  for (const row of rows) out.get(row.studentId)?.add(row.avatarId);
  return out;
}

export type StudentProgress = Progress & {
  avatar: { id: string; name: string; svgPath: string } | null;
  giftedAvatarIds: string[];
};

/** Tổng sao, cấp, tiến độ và avatar đang dùng của nhiều học viên (không kiểm tra quyền — dùng nội bộ). */
export async function progressOf(tx: DbOrTx, studentIds: string[]): Promise<Map<string, StudentProgress>> {
  const out = new Map<string, StudentProgress>();
  if (studentIds.length === 0) return out;
  const [levelList, avatarList, sums, gifts, current] = await Promise.all([
    loadLevels(tx),
    loadAvatars(tx),
    rawSums(tx, studentIds),
    giftedByStudent(tx, studentIds),
    tx.select({ id: students.id, currentAvatarId: students.currentAvatarId }).from(students).where(inArray(students.id, studentIds)),
  ]);
  for (const s of current) {
    const progress = progressFor(sums.get(s.id) ?? 0, levelList);
    const gifted = gifts.get(s.id) ?? new Set<string>();
    const { avatarId } = resolveAvatar(s.currentAvatarId, avatarList, progress.level.levelNo, gifted);
    const avatar = avatarList.find((a) => a.id === avatarId);
    out.set(s.id, {
      ...progress,
      avatar: avatar ? { id: avatar.id, name: avatar.name, svgPath: avatar.svgPath } : null,
      giftedAvatarIds: [...gifted],
    });
  }
  return out;
}

// ---------- Thông báo lên/tụt cấp + tự đổi avatar ----------

export type LevelChange = {
  studentId: string;
  fullName: string;
  direction: "up" | "down";
  fromLevel: string;
  toLevel: string;
  /** Tên avatar mới nếu avatar đang dùng bị khóa và hệ thống tự đổi. */
  avatarSwitchedTo: string | null;
};

/**
 * Gọi trong CÙNG transaction sau mọi thay đổi tổng sao: so cấp trước/sau, và nếu avatar đang dùng
 * bị khóa thì tự đổi sang avatar cao nhất còn mở. Trả về danh sách thay đổi để báo cho GV.
 */
async function syncAfterChange(tx: Tx, actor: Actor, studentIds: string[], before: Map<string, number>): Promise<LevelChange[]> {
  const [levelList, avatarList, after, gifts, rows] = await Promise.all([
    loadLevels(tx),
    loadAvatars(tx),
    rawSums(tx, studentIds),
    giftedByStudent(tx, studentIds),
    tx.select({ id: students.id, fullName: students.fullName, currentAvatarId: students.currentAvatarId }).from(students).where(inArray(students.id, studentIds)),
  ]);
  const changes: LevelChange[] = [];
  for (const s of rows) {
    const from = progressFor(before.get(s.id) ?? 0, levelList).level;
    const to = progressFor(after.get(s.id) ?? 0, levelList).level;
    const resolved = resolveAvatar(s.currentAvatarId, avatarList, to.levelNo, gifts.get(s.id) ?? new Set());
    let switchedTo: string | null = null;
    if (resolved.switched) {
      await tx.update(students).set({ currentAvatarId: resolved.avatarId, updatedAt: new Date() }).where(eq(students.id, s.id));
      // Lần gán avatar đầu tiên (trước đó chưa có) không phải là "bị khóa" nên không cần báo.
      if (s.currentAvatarId) {
        switchedTo = avatarList.find((a) => a.id === resolved.avatarId)?.name ?? null;
        await audit(tx, {
          userId: actor.userId,
          action: "avatar_auto_switched",
          tableName: "students",
          recordId: s.id,
          oldValue: { currentAvatarId: s.currentAvatarId },
          newValue: { currentAvatarId: resolved.avatarId, level: to.levelNo },
        });
      }
    }
    if (from.levelNo !== to.levelNo || switchedTo) {
      changes.push({
        studentId: s.id,
        fullName: s.fullName,
        direction: to.levelNo >= from.levelNo ? "up" : "down",
        fromLevel: from.name,
        toLevel: to.name,
        avatarSwitchedTo: switchedTo,
      });
    }
  }
  return changes;
}

/** Sau khi Admin sửa bảng cấp hoặc kho avatar: đồng bộ lại avatar của mọi học viên. */
export async function resyncAllAvatars(tx: Tx, actor: Actor) {
  const all = await tx.select({ id: students.id }).from(students);
  const ids = all.map((s) => s.id);
  await syncAfterChange(tx, actor, ids, await rawSums(tx, ids));
}

// ---------- Tiêu chí sao (Admin quản lý, GV dùng) ----------

export async function listCriteria(actor: Actor, onlyActive = !isAdmin(actor)) {
  return db
    .select()
    .from(starCriteria)
    .where(onlyActive || !isAdmin(actor) ? eq(starCriteria.active, true) : undefined)
    .orderBy(desc(starCriteria.stars), asc(starCriteria.name));
}
export const createCriteria = (actor: Actor, data: z.output<typeof criteriaInput>) =>
  createRow(actor, starCriteria, "star_criteria", data);
/** Sửa tiêu chí không đổi các lần ghi sao cũ (số sao đã được sao chép vào sổ cái). */
export const updateCriteria = (actor: Actor, id: string, data: z.output<typeof criteriaInput>) =>
  updateRow(actor, starCriteria, "star_criteria", id, data);
export const deleteCriteria = (actor: Actor, id: string) => deleteRow(actor, starCriteria, "star_criteria", id);

// ---------- Cấp bậc (Admin) ----------

async function assertLevelsValid(tx: Tx) {
  const problem = validateLevels(await loadLevels(tx));
  if (problem) throw new AppError("VALIDATION", problem);
}

export async function createLevel(actor: Actor, data: z.output<typeof levelInput>) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(levels).values(data).onConflictDoNothing().returning();
    if (!row) throw new AppError("CONFLICT", "Số thứ tự cấp đã tồn tại.", { levelNo: "Đã tồn tại" });
    await assertLevelsValid(tx);
    await audit(tx, { userId: actor.userId, action: "create", tableName: "levels", recordId: row.id, newValue: row });
    await resyncAllAvatars(tx, actor);
    return row;
  });
}

export async function updateLevel(actor: Actor, id: string, data: z.output<typeof levelInput>) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(levels).where(eq(levels.id, id)).limit(1);
    if (!before) throw notFound("cấp bậc");
    if (before.levelNo !== data.levelNo) throw new AppError("VALIDATION", "Không đổi được số thứ tự cấp.", { levelNo: "Không đổi được" });
    const [row] = await tx.update(levels).set(data).where(eq(levels.id, id)).returning();
    await assertLevelsValid(tx);
    await audit(tx, { userId: actor.userId, action: "update", tableName: "levels", recordId: id, oldValue: before, newValue: row });
    // Đổi mốc sao làm đổi cấp của học viên → avatar có thể bị khóa.
    await resyncAllAvatars(tx, actor);
    return row!;
  });
}

/** Chỉ xóa được cấp cao nhất và khi không avatar nào yêu cầu cấp đó. */
export async function deleteLevel(actor: Actor, id: string) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const all = await loadLevels(tx);
    const target = all.find((l) => l.id === id);
    if (!target) throw notFound("cấp bậc");
    if (target.levelNo !== Math.max(...all.map((l) => l.levelNo)) || all.length === 1) {
      throw new AppError("CONFLICT", "Chỉ xóa được cấp cao nhất.");
    }
    const [used] = await tx.select({ id: avatars.id }).from(avatars).where(eq(avatars.requiredLevelId, id)).limit(1);
    if (used) throw new AppError("CONFLICT", "Còn avatar yêu cầu cấp này. Hãy đổi cấp yêu cầu của avatar trước.");
    await tx.delete(levels).where(eq(levels.id, id));
    await audit(tx, { userId: actor.userId, action: "delete", tableName: "levels", recordId: id, oldValue: target });
    await resyncAllAvatars(tx, actor);
  });
}

// ---------- Ghi sao ----------

/** Tổng sao đã trừ của học viên trong buổi, không tính các lần đã hoàn tác. */
async function penaltyUsed(tx: Tx, sessionId: string, studentIds: string[]): Promise<Map<string, number>> {
  const reversal = alias(starLogs, "reversal");
  const rows = await tx
    .select({ studentId: starLogs.studentId, used: sql<number>`coalesce(sum(-${starLogs.stars}), 0)::int` })
    .from(starLogs)
    .leftJoin(reversal, eq(reversal.reversesLogId, starLogs.id))
    .where(
      and(
        eq(starLogs.sessionId, sessionId),
        inArray(starLogs.studentId, studentIds),
        sql`${starLogs.stars} < 0`,
        isNull(starLogs.reversesLogId),
        isNull(reversal.id),
      ),
    )
    .groupBy(starLogs.studentId);
  return new Map(rows.map((r) => [r.studentId, r.used]));
}

export type StarResult = { count: number; stars: number; levelChanges: LevelChange[] };

/**
 * Ghi sao theo một tiêu chí cho một em / một nhóm / cả lớp trong một transaction.
 * Số sao lấy từ tiêu chí ở máy chủ (client không tự gửi số sao).
 */
export async function awardStars(actor: Actor, input: z.output<typeof awardInput>, now: Date = new Date()): Promise<StarResult> {
  await assertSessionAccess(actor, input.sessionId);
  return db.transaction(async (tx) => {
    const [session] = await tx.select().from(sessions).where(eq(sessions.id, input.sessionId)).limit(1);
    if (!session) throw notFound("buổi học");
    if (session.status === "cancelled") throw new AppError("CONFLICT", "Buổi đã hủy nên không ghi sao được.");
    if (session.date > todayIso(now)) throw new AppError("CONFLICT", "Chưa đến ngày học.");
    await assertClassOpen(session.classId, tx);

    const [criteria] = await tx.select().from(starCriteria).where(eq(starCriteria.id, input.criteriaId)).limit(1);
    if (!criteria || !criteria.active) throw new AppError("VALIDATION", "Tiêu chí không tồn tại hoặc đã ngừng dùng.");

    const studentIds = [...new Set(input.studentIds)];
    const roster = new Map((await sessionRoster(tx, session)).map((r) => [r.studentId, r]));
    if (studentIds.some((id) => !roster.has(id))) {
      throw new AppError("VALIDATION", "Có học viên không thuộc buổi học này.");
    }
    // Khóa dòng học viên để hai lần ghi đồng thời không cùng vượt giới hạn trừ sao.
    await tx.select({ id: students.id }).from(students).where(inArray(students.id, studentIds)).orderBy(asc(students.id)).for("update");

    if (criteria.stars < 0) {
      const { max_deduction_per_session: max } = await getSettings(tx);
      const used = await penaltyUsed(tx, session.id, studentIds);
      const blocked = studentIds.filter((id) => !canDeduct(criteria.stars, used.get(id) ?? 0, max));
      if (blocked.length > 0) {
        const names = blocked.map((id) => roster.get(id)!.fullName).join(", ");
        throw new AppError("CONFLICT", `Mỗi học viên chỉ bị trừ tối đa ${max} sao trong một buổi. Đã vượt giới hạn: ${names}.`);
      }
    }

    const before = await rawSums(tx, studentIds);
    const inserted = await tx
      .insert(starLogs)
      .values(
        studentIds.map((studentId) => ({
          sessionId: session.id,
          studentId,
          criteriaId: criteria.id,
          stars: criteria.stars,
          note: input.note,
          recordedBy: actor.userId,
          recordedAt: now,
        })),
      )
      .returning({ id: starLogs.id, studentId: starLogs.studentId });
    for (const log of inserted) {
      await audit(tx, {
        userId: actor.userId,
        action: "star_recorded",
        tableName: "star_logs",
        recordId: log.id,
        newValue: { studentId: log.studentId, sessionId: session.id, criteriaId: criteria.id, stars: criteria.stars },
      });
    }
    return { count: inserted.length, stars: criteria.stars, levelChanges: await syncAfterChange(tx, actor, studentIds, before) };
  });
}

/** Hoàn tác một lần ghi sao bằng bản ghi đảo dấu (không xóa). Mỗi lần ghi chỉ hoàn tác được một lần. */
export async function undoStarLog(actor: Actor, logId: string, now: Date = new Date()): Promise<StarResult> {
  const [target] = await db.select().from(starLogs).where(eq(starLogs.id, logId)).limit(1);
  // Kiểm tra quyền trước khi tiết lộ bất kỳ thông tin nào về bản ghi.
  if (!target) throw notFound("lần ghi sao");
  if (target.sessionId) await assertSessionAccess(actor, target.sessionId);
  else assertAdmin(actor);

  return db.transaction(async (tx) => {
    await tx.select({ id: students.id }).from(students).where(eq(students.id, target.studentId)).for("update");
    if (target.sessionId) {
      const [session] = await tx.select({ classId: sessions.classId }).from(sessions).where(eq(sessions.id, target.sessionId)).limit(1);
      if (session) await assertClassOpen(session.classId, tx);
    }
    if (target.reversesLogId) throw new AppError("CONFLICT", "Không hoàn tác được một bản ghi hoàn tác.");
    const [already] = await tx.select({ id: starLogs.id }).from(starLogs).where(eq(starLogs.reversesLogId, logId)).limit(1);
    if (already) throw new AppError("CONFLICT", "Lần ghi sao này đã được hoàn tác.");

    const before = await rawSums(tx, [target.studentId]);
    const [reversal] = await tx
      .insert(starLogs)
      .values({
        sessionId: target.sessionId,
        studentId: target.studentId,
        criteriaId: target.criteriaId,
        stars: -target.stars,
        note: "Hoàn tác",
        reversesLogId: target.id,
        recordedBy: actor.userId,
        recordedAt: now,
      })
      .returning({ id: starLogs.id });
    await audit(tx, {
      userId: actor.userId,
      action: "star_undone",
      tableName: "star_logs",
      recordId: target.id,
      oldValue: { stars: target.stars, studentId: target.studentId },
      newValue: { reversalId: reversal!.id, stars: -target.stars },
    });
    return { count: 1, stars: -target.stars, levelChanges: await syncAfterChange(tx, actor, [target.studentId], before) };
  });
}

// ---------- Truy vấn cho giao diện ----------

/** GV truy cập được học viên đang học lớp mình, hoặc thuộc lớp có buổi mình dạy thay hôm nay. */
export async function assertStudentAccess(actor: Actor, studentId: string, tx: DbOrTx = db, now: Date = new Date()) {
  if (isAdmin(actor)) {
    const [row] = await tx.select({ id: students.id }).from(students).where(eq(students.id, studentId)).limit(1);
    if (!row) throw notFound("học viên");
    return;
  }
  if (!actor.teacherId) throw notFound("học viên");
  const [own] = await tx
    .select({ id: enrollments.id })
    .from(enrollments)
    .innerJoin(classTeachers, and(eq(classTeachers.classId, enrollments.classId), eq(classTeachers.teacherId, actor.teacherId)))
    .where(and(eq(enrollments.studentId, studentId), eq(enrollments.status, "active")))
    .limit(1);
  if (own) return;
  const [covering] = await tx
    .select({ id: sessions.id })
    .from(sessions)
    .innerJoin(enrollments, and(eq(enrollments.classId, sessions.classId), eq(enrollments.studentId, studentId), eq(enrollments.status, "active")))
    .where(and(eq(sessions.substituteTeacherId, actor.teacherId), eq(sessions.date, todayIso(now)), eq(sessions.status, "planned")))
    .limit(1);
  if (!covering) throw notFound("học viên");
}

const reversal = alias(starLogs, "reversal");
const logColumns = {
  id: starLogs.id,
  studentId: starLogs.studentId,
  studentName: students.fullName,
  studentCode: students.code,
  sessionId: starLogs.sessionId,
  sessionDate: sessions.date,
  classCode: classes.code,
  criteriaName: starCriteria.name,
  stars: starLogs.stars,
  note: starLogs.note,
  recordedAt: starLogs.recordedAt,
  recordedByName: user.name,
  isReversal: sql<boolean>`${starLogs.reversesLogId} is not null`,
  reversed: sql<boolean>`${reversal.id} is not null`,
};

function logQuery() {
  return db
    .select(logColumns)
    .from(starLogs)
    .innerJoin(students, eq(students.id, starLogs.studentId))
    .leftJoin(sessions, eq(sessions.id, starLogs.sessionId))
    .leftJoin(classes, eq(classes.id, sessions.classId))
    .leftJoin(starCriteria, eq(starCriteria.id, starLogs.criteriaId))
    .leftJoin(user, eq(user.id, starLogs.recordedBy))
    .leftJoin(reversal, eq(reversal.reversesLogId, starLogs.id));
}

export type StarLogRow = Awaited<ReturnType<typeof logQuery>>[number];

/** Bảng ghi sao của một buổi: danh sách học viên kèm tiến độ, tiêu chí đang dùng và sổ cái của buổi. */
export async function getSessionStarBoard(actor: Actor, sessionId: string) {
  await assertSessionAccess(actor, sessionId);
  const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!session) throw notFound("buổi học");
  const roster = await sessionRoster(db, session);
  const ids = roster.map((r) => r.studentId);
  const [progress, logs, criteria, settings] = await Promise.all([
    progressOf(db, ids),
    logQuery().where(eq(starLogs.sessionId, sessionId)).orderBy(desc(starLogs.recordedAt), desc(starLogs.id)),
    listCriteria(actor, true),
    getSettings(),
  ]);
  const net = new Map<string, number>();
  for (const log of logs) net.set(log.studentId, (net.get(log.studentId) ?? 0) + log.stars);
  return {
    maxDeduction: settings.max_deduction_per_session,
    criteria,
    logs,
    students: roster.map((r) => ({ ...r, progress: progress.get(r.studentId)!, sessionStars: net.get(r.studentId) ?? 0 })),
  };
}

/** Học viên đang học của lớp kèm avatar, cấp, tổng sao và tiến độ. */
export async function listClassProgress(actor: Actor, classId: string) {
  // listClassStudents kiểm tra quyền theo lớp.
  const list = await listClassStudents(actor, classId);
  const progress = await progressOf(db, list.map((s) => s.id));
  return list.map((s) => ({ ...s, progress: progress.get(s.id)! }));
}

/** Hồ sơ sao của một học viên: tiến độ, avatar chọn được và lịch sử ghi sao. */
export async function getStudentStarProfile(actor: Actor, studentId: string) {
  await assertStudentAccess(actor, studentId);
  const [[student], progress, avatarList, logs] = await Promise.all([
    db.select({ id: students.id, code: students.code, fullName: students.fullName }).from(students).where(eq(students.id, studentId)).limit(1),
    progressOf(db, [studentId]),
    loadAvatars(),
    logQuery().where(eq(starLogs.studentId, studentId)).orderBy(desc(starLogs.recordedAt), desc(starLogs.id)).limit(100),
  ]);
  const mine = progress.get(studentId)!;
  const gifted = new Set(mine.giftedAvatarIds);
  return {
    student: student!,
    progress: mine,
    logs,
    avatars: avatarList
      // Avatar tặng riêng chỉ hiện với học viên đã được tặng.
      .filter((a) => a.active && (a.unlockType === "by_level" || gifted.has(a.id)))
      .map((a) => ({
        id: a.id,
        name: a.name,
        svgPath: a.svgPath,
        gifted: gifted.has(a.id),
        unlocked: gifted.has(a.id) || (a.requiredLevelNo !== null && a.requiredLevelNo <= mine.level.levelNo),
        requiredMinStars: a.requiredMinStars,
      })),
  };
}

/** Sổ cái toàn trung tâm (Admin). */
export async function listRecentStarLogs(actor: Actor, limit = 200) {
  assertAdmin(actor);
  return logQuery().orderBy(desc(starLogs.recordedAt), desc(starLogs.id)).limit(limit);
}
