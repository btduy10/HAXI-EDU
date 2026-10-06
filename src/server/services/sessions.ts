import { and, asc, between, desc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db, type Tx } from "@/db";
import {
  attendances,
  classTeachers,
  classes,
  enrollments,
  holidays,
  rooms,
  scheduleTemplates,
  sessionStudents,
  sessions,
  starLogs,
  teachers,
  timeSlots,
} from "@/db/schema";
import {
  type BusySession,
  describeConflict,
  findConflicts,
  isEnrolledOn,
  planSessions,
  staffOf,
} from "@/domain/schedule";
import { formatDate, todayIso } from "@/lib/format";
import type {
  makeupInput,
  manualSessionInput,
  sessionCancelInput,
  sessionEditInput,
  sessionRescheduleInput,
  sessionSubstituteInput,
  templateInput,
  templateUpdateInput,
} from "@/lib/validation/schedule";
import { audit } from "../audit";
import { AppError, notFound } from "../errors";
import { type Actor, allowedClassIds, assertAdmin, assertCan, assertCanAny, assertClassAccess, assertSessionAccess } from "../guard";
import { purgeSessionStarLogs } from "./stars";

const substitute = alias(teachers, "substitute");
const assistant = alias(teachers, "assistant");

const sessionColumns = {
  id: sessions.id,
  classId: sessions.classId,
  classCode: classes.code,
  className: classes.name,
  classStatus: classes.status,
  date: sessions.date,
  originalDate: sessions.originalDate,
  startTime: sessions.startTime,
  endTime: sessions.endTime,
  timeSlotId: sessions.timeSlotId,
  slotName: timeSlots.name,
  roomId: sessions.roomId,
  roomName: rooms.name,
  teacherId: sessions.teacherId,
  teacherName: teachers.fullName,
  substituteTeacherId: sessions.substituteTeacherId,
  substituteName: substitute.fullName,
  assistantTeacherId: sessions.assistantTeacherId,
  assistantName: assistant.fullName,
  kind: sessions.kind,
  status: sessions.status,
  content: sessions.content,
  note: sessions.note,
  attendanceUnlockedUntil: sessions.attendanceUnlockedUntil,
  attendanceCount: sql<number>`(select count(*)::int from ${attendances} where ${attendances.sessionId} = ${sessions.id})`,
  starLogCount: sql<number>`(select count(*)::int from ${starLogs} where ${starLogs.sessionId} = ${sessions.id})`,
};

function sessionQuery() {
  return db
    .select(sessionColumns)
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .leftJoin(timeSlots, eq(timeSlots.id, sessions.timeSlotId))
    .leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .leftJoin(teachers, eq(teachers.id, sessions.teacherId))
    .leftJoin(substitute, eq(substitute.id, sessions.substituteTeacherId))
    .leftJoin(assistant, eq(assistant.id, sessions.assistantTeacherId));
}

/** Buổi mà GV này đứng lớp: dạy chính, dạy thay hoặc trợ giảng. */
const taughtBy = (teacherId: string) =>
  or(eq(sessions.teacherId, teacherId), eq(sessions.substituteTeacherId, teacherId), eq(sessions.assistantTeacherId, teacherId))!;

export type SessionRow = Awaited<ReturnType<typeof sessionQuery>>[number];

export type SessionFilters = {
  from: string;
  to: string;
  classId?: string | null;
  teacherId?: string | null;
  roomId?: string | null;
  /** Chỉ các buổi GV này đứng lớp hoặc dạy thay (TKB cá nhân). */
  personal?: boolean;
};

/** Admin và phạm vi "Tất cả lớp" xem mọi buổi; phạm vi "lớp của mình" chỉ thấy buổi của lớp mình và buổi mình dạy/dạy thay. */
export async function listSessions(actor: Actor, filters: SessionFilters): Promise<SessionRow[]> {
  const conditions = [between(sessions.date, filters.from, filters.to)];
  if (filters.classId) conditions.push(eq(sessions.classId, filters.classId));
  if (filters.roomId) conditions.push(eq(sessions.roomId, filters.roomId));
  if (filters.teacherId) {
    conditions.push(taughtBy(filters.teacherId));
  }

  const allowed = await allowedClassIds(actor);
  const mine = actor.teacherId ? taughtBy(actor.teacherId) : null;
  if (allowed !== null) {
    // Phạm vi "lớp của mình": buổi mình dạy/dạy thay, cộng các buổi của lớp được phân công.
    if (!mine) return [];
    conditions.push(filters.personal || allowed.length === 0 ? mine : or(mine, inArray(sessions.classId, allowed))!);
  }

  return sessionQuery()
    .where(and(...conditions))
    .orderBy(asc(sessions.date), asc(sessions.startTime));
}

/**
 * Ngày của buổi học sắp tới gần nhất (chưa hủy) của lớp, tính từ `from`; không còn buổi nào thì lấy buổi gần nhất đã qua.
 * Dùng để mở Thời khóa biểu đúng tuần có buổi của lớp.
 */
export async function nextSessionDate(actor: Actor, classId: string, from: string): Promise<string | null> {
  assertCan(actor, "timetable", "view");
  await assertClassAccess(actor, classId);
  const base = and(eq(sessions.classId, classId), ne(sessions.status, "cancelled"));
  const [next] = await db.select({ date: sessions.date }).from(sessions).where(and(base, gte(sessions.date, from))).orderBy(asc(sessions.date)).limit(1);
  if (next) return next.date;
  const [last] = await db.select({ date: sessions.date }).from(sessions).where(base).orderBy(desc(sessions.date)).limit(1);
  return last?.date ?? null;
}

export async function getSession(actor: Actor, sessionId: string): Promise<SessionRow> {
  await assertSessionAccess(actor, sessionId);
  const [row] = await sessionQuery().where(eq(sessions.id, sessionId)).limit(1);
  if (!row) throw notFound("buổi học");
  return row;
}

// ---------- Lịch mẫu ----------

export async function listTemplates(actor: Actor, classId: string) {
  assertCanAny(actor, ["classes", "view"], ["timetable", "view"]);
  await assertClassAccess(actor, classId);
  return db
    .select({
      id: scheduleTemplates.id,
      weekday: scheduleTemplates.weekday,
      timeSlotId: scheduleTemplates.timeSlotId,
      slotName: timeSlots.name,
      slotStart: timeSlots.defaultStart,
      slotEnd: timeSlots.defaultEnd,
      startTime: scheduleTemplates.startTime,
      endTime: scheduleTemplates.endTime,
      roomId: scheduleTemplates.roomId,
      roomName: rooms.name,
      teacherId: scheduleTemplates.teacherId,
      teacherName: teachers.fullName,
      assistantTeacherId: scheduleTemplates.assistantTeacherId,
      assistantName: assistant.fullName,
    })
    .from(scheduleTemplates)
    .innerJoin(timeSlots, eq(timeSlots.id, scheduleTemplates.timeSlotId))
    .leftJoin(rooms, eq(rooms.id, scheduleTemplates.roomId))
    .leftJoin(teachers, eq(teachers.id, scheduleTemplates.teacherId))
    .leftJoin(assistant, eq(assistant.id, scheduleTemplates.assistantTeacherId))
    .where(eq(scheduleTemplates.classId, classId))
    .orderBy(asc(scheduleTemplates.weekday), asc(timeSlots.defaultStart));
}

// Thêm/sửa/xóa dòng lịch mẫu là một phần của "Sửa lớp".

/** Trợ giảng phải khác giáo viên chính của cùng dòng lịch mẫu / buổi học. */
function assertDistinctAssistant(teacherId: string | null | undefined, assistantTeacherId: string | null | undefined) {
  if (assistantTeacherId && assistantTeacherId === teacherId) {
    throw new AppError("VALIDATION", "Trợ giảng phải khác giáo viên chính.", { assistantTeacherId: "Phải khác GV chính" });
  }
}

/** Thêm dòng lịch mẫu rồi tự sinh các buổi từ hôm nay đến hết khóa cho dòng đó (bỏ ngày nghỉ, báo buổi bị trùng). */
export async function createTemplate(actor: Actor, data: z.output<typeof templateInput>, now: Date = new Date()): Promise<GenerationResult> {
  assertCan(actor, "classes", "edit");
  await assertClassAccess(actor, data.classId);
  assertDistinctAssistant(data.teacherId, data.assistantTeacherId);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const [cls] = await tx.select({ status: classes.status }).from(classes).where(eq(classes.id, data.classId)).limit(1);
    if (!cls) throw notFound("lớp học");
    const [row] = await tx.insert(scheduleTemplates).values(data).returning();
    await audit(tx, { userId: actor.userId, action: "create", tableName: "schedule_templates", recordId: row!.id, newValue: row });
    if (cls.status !== "open") return { created: 0, alreadyExisting: 0, conflicts: [], warnings: [] };
    return withNotices(await generateInTx(tx, actor, data.classId, row!.id, todayIso(now)));
  });
}

/**
 * Sửa dòng lịch mẫu và áp sang các buổi TƯƠNG LAI chưa điểm danh của dòng đó.
 * Chỉ đổi những trường của buổi còn đúng giá trị cũ của lịch mẫu, nên buổi đã sửa tay riêng được giữ nguyên.
 * Đổi thứ trong tuần: xóa các buổi tương lai chưa điểm danh của dòng đó rồi sinh lại theo thứ mới.
 * Buổi bị trùng lịch sau khi đổi thì giữ nguyên và được báo lại.
 */
export async function updateTemplate(
  actor: Actor,
  input: z.output<typeof templateUpdateInput>,
  now: Date = new Date(),
): Promise<GenerationResult & { updated: number }> {
  assertCan(actor, "classes", "edit");
  const { id, ...data } = input;
  assertDistinctAssistant(data.teacherId, data.assistantTeacherId);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const [before] = await tx.select().from(scheduleTemplates).where(eq(scheduleTemplates.id, id)).for("update").limit(1);
    if (!before) throw notFound("lịch mẫu");
    await assertClassAccess(actor, before.classId, tx);
    const [cls] = await tx.select().from(classes).where(eq(classes.id, before.classId)).limit(1);
    if (!cls) throw notFound("lớp học");
    const [after] = await tx.update(scheduleTemplates).set(data).where(eq(scheduleTemplates.id, id)).returning();
    await audit(tx, { userId: actor.userId, action: "update", tableName: "schedule_templates", recordId: id, oldValue: before, newValue: after });

    const result: GenerationResult & { updated: number } = { created: 0, alreadyExisting: 0, conflicts: [], warnings: [], updated: 0 };
    if (cls.status !== "open") return result;
    const today = todayIso(now);
    const upcoming = await tx
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.templateId, id),
          gte(sessions.date, today),
          eq(sessions.status, "planned"),
          sql`not exists (select 1 from ${attendances} where ${attendances.sessionId} = ${sessions.id})`,
        ),
      );

    if (before.weekday !== after!.weekday) {
      // Đổi thứ: các buổi tương lai chưa điểm danh của dòng này được sinh lại theo thứ mới.
      if (upcoming.length > 0) {
        await tx.delete(sessions).where(inArray(sessions.id, upcoming.map((u) => u.id)));
      }
      return withNotices({ ...result, ...(await generateInTx(tx, actor, before.classId, id, today)), updated: 0 });
    }

    // Giá trị cũ / mới mà lịch mẫu áp cho buổi (giờ riêng hoặc giờ của ca, phòng mặc định, GV chính của lớp).
    const slotTimes = async (slotId: string) => {
      const [slot] = await tx.select().from(timeSlots).where(eq(timeSlots.id, slotId)).limit(1);
      return slot ? { start: slot.defaultStart.slice(0, 5), end: slot.defaultEnd.slice(0, 5) } : null;
    };
    const [mainTeacher] = await tx
      .select({ teacherId: classTeachers.teacherId })
      .from(classTeachers)
      .where(and(eq(classTeachers.classId, cls.id), eq(classTeachers.role, "main")))
      .limit(1);
    const applied = async (t: typeof before) => {
      const slot = await slotTimes(t.timeSlotId);
      return {
        timeSlotId: t.timeSlotId,
        startTime: (t.startTime ?? slot?.start ?? "").slice(0, 5),
        endTime: (t.endTime ?? slot?.end ?? "").slice(0, 5),
        roomId: t.roomId ?? cls.defaultRoomId,
        teacherId: t.teacherId ?? mainTeacher?.teacherId ?? null,
        assistantTeacherId: t.assistantTeacherId,
      };
    };
    const oldValues = await applied(before);
    const newValues = await applied(after!);
    const busy = await loadBusy(tx, today, cls.endDate);

    for (const s of upcoming) {
      const patch: Partial<typeof sessions.$inferInsert> = {};
      // Giờ chỉ đổi khi buổi còn đúng giờ cũ của lịch mẫu (chưa sửa tay); ca đi theo giờ.
      if (s.startTime.slice(0, 5) === oldValues.startTime && s.endTime.slice(0, 5) === oldValues.endTime) {
        if (oldValues.startTime !== newValues.startTime || oldValues.endTime !== newValues.endTime || s.timeSlotId !== newValues.timeSlotId) {
          Object.assign(patch, { startTime: newValues.startTime, endTime: newValues.endTime, timeSlotId: newValues.timeSlotId });
        }
      }
      for (const key of ["roomId", "teacherId", "assistantTeacherId"] as const) {
        if (s[key] === oldValues[key] && oldValues[key] !== newValues[key]) patch[key] = newValues[key];
      }
      if (Object.keys(patch).length === 0) continue;
      const next = { ...s, ...patch };
      if (next.assistantTeacherId && next.assistantTeacherId === (next.substituteTeacherId ?? next.teacherId)) {
        result.conflicts.push({ date: s.date, startTime: s.startTime.slice(0, 5), reason: "Trợ giảng trùng với giáo viên dạy buổi này" });
        continue;
      }
      const conflicts = findConflicts(
        { id: s.id, date: next.date, startTime: next.startTime, endTime: next.endTime, roomId: next.roomId ?? null, teacherIds: staffOf(next) },
        busy,
      );
      if (conflicts.length > 0) {
        result.conflicts.push({ date: s.date, startTime: s.startTime.slice(0, 5), reason: [...new Set(conflicts.map(describeConflict))].join("; ") });
        continue;
      }
      await tx.update(sessions).set({ ...patch, updatedAt: new Date() }).where(eq(sessions.id, s.id));
      const index = busy.findIndex((b) => b.id === s.id);
      const entry = { id: s.id, date: next.date, startTime: next.startTime, endTime: next.endTime, roomId: next.roomId ?? null, teacherIds: staffOf(next), label: cls.code };
      if (index >= 0) busy[index] = entry;
      else busy.push(entry);
      result.updated++;
    }
    if (result.updated > 0) {
      await audit(tx, {
        userId: actor.userId,
        action: "sessions_updated_from_template",
        tableName: "sessions",
        recordId: id,
        newValue: { updated: result.updated, conflicts: result.conflicts.length },
      });
    }
    return withNotices(result);
  });
}

/** Xóa dòng lịch mẫu không xóa các buổi đã sinh (template_id của buổi thành null). */
export async function deleteTemplate(actor: Actor, id: string) {
  assertCan(actor, "classes", "edit");
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(scheduleTemplates).where(eq(scheduleTemplates.id, id)).limit(1);
    if (!before) throw notFound();
    await assertClassAccess(actor, before.classId, tx);
    await tx.delete(scheduleTemplates).where(eq(scheduleTemplates.id, id));
    await audit(tx, { userId: actor.userId, action: "delete", tableName: "schedule_templates", recordId: id, oldValue: before });
  });
}

// ---------- Kiểm tra trùng lịch ----------

/** Mọi thay đổi lịch chạy tuần tự để hai thao tác đồng thời không cùng lọt qua kiểm tra trùng. */
const lockSchedule = (tx: Tx) => tx.execute(sql`select pg_advisory_xact_lock(727001)`);

async function loadBusy(tx: Tx, from: string, to: string): Promise<BusySession[]> {
  const rows = await tx
    .select({
      id: sessions.id,
      date: sessions.date,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
      roomId: sessions.roomId,
      teacherId: sessions.teacherId,
      substituteTeacherId: sessions.substituteTeacherId,
      assistantTeacherId: sessions.assistantTeacherId,
      label: classes.code,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .where(and(between(sessions.date, from, to), ne(sessions.status, "cancelled")));
  return rows.map((r) => ({ id: r.id, date: r.date, startTime: r.startTime, endTime: r.endTime, roomId: r.roomId, label: r.label, teacherIds: staffOf(r) }));
}

type Candidate = {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  /** Người đứng lớp: GV thực dạy (đã tính dạy thay) và trợ giảng. */
  teacherIds: string[];
};

/** Trùng GV hoặc phòng theo giờ thực tế → CHẶN. */
function assertNoConflict(candidate: Candidate, busy: BusySession[]) {
  const conflicts = findConflicts(candidate, busy);
  if (conflicts.length > 0) {
    throw new AppError("CONFLICT", `Trùng lịch: ${[...new Set(conflicts.map(describeConflict))].join("; ")}.`);
  }
}

/** Vượt sức chứa phòng → chỉ CẢNH BÁO. */
async function capacityWarnings(tx: Tx, roomId: string | null, headcount: number): Promise<string[]> {
  if (!roomId) return [];
  const [room] = await tx.select().from(rooms).where(eq(rooms.id, roomId)).limit(1);
  return room && headcount > room.capacity
    ? [`Phòng ${room.name} chỉ chứa ${room.capacity} người nhưng buổi học có ${headcount} học viên.`]
    : [];
}

async function headcountOf(tx: Tx, session: { id: string; classId: string; date: string; kind: "regular" | "makeup" }) {
  if (session.kind === "makeup") {
    const [row] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(sessionStudents)
      .where(eq(sessionStudents.sessionId, session.id));
    return row?.n ?? 0;
  }
  const rows = await tx
    .select({ joinedAt: enrollments.joinedAt, leftAt: enrollments.leftAt })
    .from(enrollments)
    .where(eq(enrollments.classId, session.classId));
  return rows.filter((e) => isEnrolledOn(e, session.date)).length;
}

export type ScheduleResult = { warnings: string[] };

// ---------- Sinh buổi ----------

export type GenerationResult = {
  created: number;
  alreadyExisting: number;
  conflicts: { date: string; startTime: string; reason: string }[];
  warnings: string[];
  /** Thông báo cho người dùng sau khi tự sinh/cập nhật buổi (hiện dạng toast thông tin). */
  notices?: string[];
};

/** Kèm thông báo dễ đọc cho kết quả tự sinh/tự cập nhật buổi: số buổi thêm/đổi và từng buổi bị trùng lịch. */
function withNotices<T extends GenerationResult & { updated?: number }>(result: T): T {
  const notices: string[] = [];
  if (result.created > 0) notices.push(`Đã tự thêm ${result.created} buổi vào Thời khóa biểu.`);
  if (result.updated) notices.push(`Đã cập nhật ${result.updated} buổi sắp tới theo lịch mẫu.`);
  const skipped = result.conflicts.map((c) => `Bỏ qua buổi ${formatDate(c.date)} ${c.startTime.slice(0, 5)}: ${c.reason}.`);
  return { ...result, notices, warnings: [...result.warnings, ...skipped] };
}

/**
 * Sinh buổi học từ lịch mẫu trong khoảng ngày của lớp, bỏ ngày nghỉ.
 * Chạy lại nhiều lần an toàn: buổi đã có (kể cả đã dời/sửa giờ) không bị tạo lại hay ghi đè.
 * Buổi trùng GV/phòng không được tạo và được trả về trong `conflicts`.
 */
export async function generateSessions(actor: Actor, classId: string): Promise<GenerationResult> {
  assertCan(actor, "classes", "edit");
  await assertClassAccess(actor, classId);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    return generateInTx(tx, actor, classId);
  });
}

/**
 * Lõi sinh buổi, chạy trong transaction đã khóa lịch. `templateId`: chỉ sinh cho một dòng lịch mẫu;
 * `fromDate`: chỉ sinh các buổi từ ngày này trở đi (dùng khi tự sinh sau khi thêm/sửa lịch mẫu).
 */
async function generateInTx(tx: Tx, actor: Actor, classId: string, templateId?: string, fromDate?: string): Promise<GenerationResult> {
  const [cls] = await tx.select().from(classes).where(eq(classes.id, classId)).limit(1);
  if (!cls) throw notFound("lớp học");
  if (cls.status !== "open") throw new AppError("CONFLICT", "Lớp đã đóng, không thể sinh buổi học.");

  const templates = await tx
    .select({
      id: scheduleTemplates.id,
      weekday: scheduleTemplates.weekday,
      timeSlotId: scheduleTemplates.timeSlotId,
      slotStart: timeSlots.defaultStart,
      slotEnd: timeSlots.defaultEnd,
      startTime: scheduleTemplates.startTime,
      endTime: scheduleTemplates.endTime,
      roomId: scheduleTemplates.roomId,
      teacherId: scheduleTemplates.teacherId,
      assistantTeacherId: scheduleTemplates.assistantTeacherId,
    })
    .from(scheduleTemplates)
    .innerJoin(timeSlots, eq(timeSlots.id, scheduleTemplates.timeSlotId))
    .where(and(eq(scheduleTemplates.classId, classId), templateId ? eq(scheduleTemplates.id, templateId) : undefined));
  if (templates.length === 0) throw new AppError("VALIDATION", "Lớp chưa có lịch mẫu.");

  const holidayRows = await tx
    .select({ date: holidays.date })
    .from(holidays)
    .where(
      and(
        gte(holidays.date, cls.startDate),
        lte(holidays.date, cls.endDate),
        or(isNull(holidays.classId), eq(holidays.classId, classId)),
      ),
    );
  const [mainTeacher] = await tx
    .select({ teacherId: classTeachers.teacherId })
    .from(classTeachers)
    .where(and(eq(classTeachers.classId, classId), eq(classTeachers.role, "main")))
    .limit(1);

  const planned = planSessions({
    startDate: fromDate && fromDate > cls.startDate ? fromDate : cls.startDate,
    endDate: cls.endDate,
    templates,
    holidays: new Set(holidayRows.map((h) => h.date)),
    defaultRoomId: cls.defaultRoomId,
    defaultTeacherId: mainTeacher?.teacherId ?? null,
  });

  // Khóa nhận diện buổi đã sinh: dòng lịch mẫu + ngày GỐC (buổi đã dời vẫn được nhận ra).
  const existing = await tx
    .select({ templateId: sessions.templateId, date: sessions.date, originalDate: sessions.originalDate })
    .from(sessions)
    .where(eq(sessions.classId, classId));
  const existingKeys = new Set(existing.map((s) => `${s.templateId}|${s.originalDate ?? s.date}`));

  const busy = await loadBusy(tx, cls.startDate, cls.endDate);
  const result: GenerationResult = { created: 0, alreadyExisting: 0, conflicts: [], warnings: [] };
  const toInsert: (typeof sessions.$inferInsert)[] = [];

  for (const p of planned) {
    if (existingKeys.has(`${p.templateId}|${p.date}`)) {
      result.alreadyExisting++;
      continue;
    }
    if (p.assistantTeacherId && p.assistantTeacherId === p.teacherId) {
      result.conflicts.push({ date: p.date, startTime: p.startTime, reason: "Trợ giảng trùng với giáo viên chính" });
      continue;
    }
    const conflicts = findConflicts({ ...p, teacherIds: staffOf(p) }, busy);
    if (conflicts.length > 0) {
      result.conflicts.push({ date: p.date, startTime: p.startTime, reason: [...new Set(conflicts.map(describeConflict))].join("; ") });
      continue;
    }
    toInsert.push({ ...p, classId, kind: "regular", status: "planned" });
    // Buổi vừa lên kế hoạch cũng chiếm GV/phòng đối với các buổi sau trong cùng lần sinh.
    busy.push({ id: `new-${toInsert.length}`, label: cls.code, ...p, teacherIds: staffOf(p) });
  }

  if (toInsert.length > 0) {
    await tx.insert(sessions).values(toInsert);
    result.created = toInsert.length;
    const roomIds = [...new Set(toInsert.map((s) => s.roomId).filter((r): r is string => Boolean(r)))];
    const headcount = await headcountOf(tx, { id: "", classId, date: cls.startDate, kind: "regular" });
    for (const roomId of roomIds) result.warnings.push(...(await capacityWarnings(tx, roomId, headcount)));
  }
  await audit(tx, {
    userId: actor.userId,
    action: "sessions_generated",
    tableName: "sessions",
    recordId: classId,
    newValue: { created: result.created, conflicts: result.conflicts.length, templateId: templateId ?? null },
  });
  return result;
}

// ---------- Điều chỉnh từng buổi ----------

/** Nạp buổi để sửa (khóa dòng) và bảo đảm lớp của buổi nằm trong phạm vi của người thao tác. */
async function loadForChange(tx: Tx, actor: Actor, sessionId: string) {
  const [row] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).for("update").limit(1);
  if (!row) throw notFound("buổi học");
  await assertClassAccess(actor, row.classId, tx);
  return row;
}

async function applyChange(
  tx: Tx,
  actor: Actor,
  before: typeof sessions.$inferSelect,
  patch: Partial<typeof sessions.$inferInsert>,
  action: string,
): Promise<ScheduleResult> {
  const next = { ...before, ...patch };
  let warnings: string[] = [];
  if (next.status !== "cancelled") {
    assertDistinctAssistant(next.substituteTeacherId ?? next.teacherId, next.assistantTeacherId);
    assertNoConflict(
      {
        id: before.id,
        date: next.date,
        startTime: next.startTime,
        endTime: next.endTime,
        roomId: next.roomId ?? null,
        teacherIds: staffOf(next),
      },
      await loadBusy(tx, next.date, next.date),
    );
    warnings = await capacityWarnings(tx, next.roomId ?? null, await headcountOf(tx, next));
  }
  const [after] = await tx
    .update(sessions)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(sessions.id, before.id))
    .returning();
  await audit(tx, { userId: actor.userId, action, tableName: "sessions", recordId: before.id, oldValue: before, newValue: after });
  return { warnings };
}

/** Sửa giờ/phòng/GV/nội dung của RIÊNG một buổi; ca gốc và các buổi khác không đổi. */
export async function updateSession(actor: Actor, input: z.output<typeof sessionEditInput>): Promise<ScheduleResult> {
  assertCan(actor, "timetable", "edit");
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const { id, ...patch } = input;
    const before = await loadForChange(tx, actor, id);
    if (before.status === "cancelled") throw new AppError("CONFLICT", "Buổi đã hủy. Hãy khôi phục trước khi sửa.");
    return applyChange(tx, actor, before, patch, "session_updated");
  });
}

/** Dời buổi sang ngày/giờ khác; lưu ngày gốc lần đầu dời. */
export async function rescheduleSession(actor: Actor, input: z.output<typeof sessionRescheduleInput>): Promise<ScheduleResult> {
  assertCan(actor, "timetable", "edit");
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const before = await loadForChange(tx, actor, input.id);
    if (before.status !== "planned") throw new AppError("CONFLICT", "Chỉ dời được buổi chưa diễn ra và chưa hủy.");
    const result = await applyChange(
      tx,
      actor,
      before,
      {
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        originalDate: before.originalDate ?? (input.date !== before.date ? before.date : null),
      },
      "session_rescheduled",
    );
    const [holiday] = await tx
      .select({ reason: holidays.reason })
      .from(holidays)
      .where(and(eq(holidays.date, input.date), or(isNull(holidays.classId), eq(holidays.classId, before.classId))))
      .limit(1);
    if (holiday) result.warnings.push(`Ngày mới trùng ngày nghỉ: ${holiday.reason}.`);
    return result;
  });
}

/** Hủy buổi: không cần điểm danh và không tính vào chuyên cần. */
export async function cancelSession(actor: Actor, input: z.output<typeof sessionCancelInput>): Promise<ScheduleResult> {
  assertCan(actor, "timetable", "edit");
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const before = await loadForChange(tx, actor, input.id);
    if (before.status === "cancelled") throw new AppError("CONFLICT", "Buổi này đã hủy.");
    if (before.status === "done") throw new AppError("CONFLICT", "Buổi đã điểm danh nên không thể hủy.");
    return applyChange(tx, actor, before, { status: "cancelled", note: input.note ?? before.note }, "session_cancelled");
  });
}

export async function restoreSession(actor: Actor, sessionId: string): Promise<ScheduleResult> {
  assertCan(actor, "timetable", "edit");
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const before = await loadForChange(tx, actor, sessionId);
    if (before.status !== "cancelled") throw new AppError("CONFLICT", "Buổi này không ở trạng thái đã hủy.");
    return applyChange(tx, actor, before, { status: "planned" }, "session_restored");
  });
}

/**
 * Admin xóa hẳn một buổi (xếp sai, dữ liệu thử), kể cả buổi đã điểm danh/ghi sao: điểm danh và sao của buổi
 * bị xóa theo, cấp và avatar của học viên được tính lại. Lớp đã đóng (đã chốt tổng kết) thì không xóa được.
 */
export async function deleteSession(actor: Actor, sessionId: string): Promise<{ date: string; deletedAttendances: number; deletedStarLogs: number }> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const before = await loadForChange(tx, actor, sessionId);
    const [cls] = await tx.select({ status: classes.status }).from(classes).where(eq(classes.id, before.classId)).limit(1);
    if (cls?.status !== "open") throw new AppError("CONFLICT", "Lớp đã đóng và đã chốt tổng kết nên không xóa buổi học được.");
    const deletedStarLogs = await purgeSessionStarLogs(tx, actor, sessionId);
    const removed = await tx.delete(attendances).where(eq(attendances.sessionId, sessionId)).returning({ id: attendances.id });
    await tx.delete(sessions).where(eq(sessions.id, sessionId));
    await audit(tx, {
      userId: actor.userId,
      action: "session_deleted",
      tableName: "sessions",
      recordId: sessionId,
      oldValue: before,
      newValue: { deletedAttendances: removed.length, deletedStarLogs },
    });
    return { date: before.date, deletedAttendances: removed.length, deletedStarLogs };
  });
}

/** Phân GV dạy thay: giữ GV gốc, lưu thêm GV thay. Để trống = bỏ dạy thay. */
export async function setSubstitute(actor: Actor, input: z.output<typeof sessionSubstituteInput>): Promise<ScheduleResult> {
  assertCan(actor, "timetable", "edit");
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const before = await loadForChange(tx, actor, input.id);
    if (before.status === "cancelled") throw new AppError("CONFLICT", "Buổi đã hủy.");
    if (input.substituteTeacherId && input.substituteTeacherId === before.assistantTeacherId) {
      throw new AppError("VALIDATION", "GV dạy thay đang là trợ giảng của buổi này.", { substituteTeacherId: "Đang là trợ giảng" });
    }
    if (input.substituteTeacherId && input.substituteTeacherId === before.teacherId) {
      throw new AppError("VALIDATION", "GV dạy thay phải khác GV của buổi.", { substituteTeacherId: "Phải khác GV của buổi" });
    }
    return applyChange(tx, actor, before, { substituteTeacherId: input.substituteTeacherId }, "session_substitute_set");
  });
}

/** Thêm buổi bù chỉ gồm các học viên được chọn (phải đang ghi danh lớp tại ngày bù). */
export async function createMakeupSession(
  actor: Actor,
  input: z.output<typeof makeupInput>,
): Promise<ScheduleResult & { id: string }> {
  assertCan(actor, "timetable", "add");
  await assertClassAccess(actor, input.classId);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const [cls] = await tx.select().from(classes).where(eq(classes.id, input.classId)).limit(1);
    if (!cls) throw notFound("lớp học");
    if (cls.status !== "open") throw new AppError("CONFLICT", "Lớp đã đóng, không thể thêm buổi bù.");

    const studentIds = [...new Set(input.studentIds)];
    const enrolled = await tx
      .select({ studentId: enrollments.studentId, joinedAt: enrollments.joinedAt, leftAt: enrollments.leftAt })
      .from(enrollments)
      .where(and(eq(enrollments.classId, input.classId), inArray(enrollments.studentId, studentIds)));
    const valid = new Set(enrolled.filter((e) => isEnrolledOn(e, input.date)).map((e) => e.studentId));
    if (studentIds.some((id) => !valid.has(id))) {
      throw new AppError("VALIDATION", "Có học viên không thuộc lớp này tại ngày học bù.", { studentIds: "Học viên không thuộc lớp" });
    }

    assertNoConflict(
      { date: input.date, startTime: input.startTime, endTime: input.endTime, roomId: input.roomId, teacherIds: [input.teacherId] },
      await loadBusy(tx, input.date, input.date),
    );
    const [created] = await tx
      .insert(sessions)
      .values({
        classId: input.classId,
        date: input.date,
        startTime: input.startTime,
        endTime: input.endTime,
        roomId: input.roomId,
        teacherId: input.teacherId,
        kind: "makeup",
        status: "planned",
        note: input.note,
      })
      .returning();
    await tx.insert(sessionStudents).values(studentIds.map((studentId) => ({ sessionId: created!.id, studentId })));
    await audit(tx, {
      userId: actor.userId,
      action: "session_makeup_created",
      tableName: "sessions",
      recordId: created!.id,
      newValue: { ...created, studentIds },
    });
    return { id: created!.id, warnings: await capacityWarnings(tx, input.roomId, studentIds.length) };
  });
}

/**
 * Admin xếp tay một buổi học vào một ngày và ca bất kỳ (không qua lịch mẫu).
 * Giờ lấy từ ca; không chọn GV/phòng thì dùng GV chính và phòng mặc định của lớp.
 * Vẫn kiểm tra trùng GV/phòng theo giờ thực tế như mọi buổi khác.
 */
export async function createManualSession(
  actor: Actor,
  input: z.output<typeof manualSessionInput>,
): Promise<ScheduleResult & { id: string }> {
  assertCan(actor, "timetable", "add");
  await assertClassAccess(actor, input.classId);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const [cls] = await tx.select().from(classes).where(eq(classes.id, input.classId)).limit(1);
    if (!cls) throw notFound("lớp học");
    if (cls.status !== "open") throw new AppError("CONFLICT", "Lớp đã đóng, không thể xếp thêm buổi.");
    const [slot] = await tx.select().from(timeSlots).where(eq(timeSlots.id, input.timeSlotId)).limit(1);
    if (!slot) throw notFound("ca học");

    let teacherId = input.teacherId;
    if (!teacherId) {
      const [main] = await tx
        .select({ teacherId: classTeachers.teacherId })
        .from(classTeachers)
        .where(and(eq(classTeachers.classId, cls.id), eq(classTeachers.role, "main")))
        .limit(1);
      teacherId = main?.teacherId ?? null;
    }
    if (!teacherId) {
      throw new AppError("VALIDATION", "Lớp chưa có giáo viên chính. Hãy chọn giáo viên cho buổi này.", { teacherId: "Bắt buộc chọn" });
    }
    const candidate = {
      date: input.date,
      startTime: slot.defaultStart.slice(0, 5),
      endTime: slot.defaultEnd.slice(0, 5),
      roomId: input.roomId ?? cls.defaultRoomId,
      teacherId,
    };
    assertNoConflict({ ...candidate, teacherIds: [teacherId] }, await loadBusy(tx, input.date, input.date));

    const [created] = await tx
      .insert(sessions)
      .values({ ...candidate, classId: cls.id, timeSlotId: slot.id, kind: "regular", status: "planned" })
      .returning();
    await audit(tx, { userId: actor.userId, action: "session_created", tableName: "sessions", recordId: created!.id, newValue: created });

    const warnings = await capacityWarnings(tx, candidate.roomId, await headcountOf(tx, created!));
    if (input.date < cls.startDate || input.date > cls.endDate) warnings.push("Ngày này nằm ngoài thời gian học của lớp.");
    const [holiday] = await tx
      .select({ reason: holidays.reason })
      .from(holidays)
      .where(and(eq(holidays.date, input.date), or(isNull(holidays.classId), eq(holidays.classId, cls.id))))
      .limit(1);
    if (holiday) warnings.push(`Ngày này là ngày nghỉ: ${holiday.reason}.`);
    return { id: created!.id, warnings };
  });
}