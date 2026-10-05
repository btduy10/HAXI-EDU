import { and, asc, between, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
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
  teachers,
  timeSlots,
} from "@/db/schema";
import {
  type BusySession,
  describeConflict,
  findConflicts,
  isEnrolledOn,
  planSessions,
} from "@/domain/schedule";
import type {
  makeupInput,
  manualSessionInput,
  sessionCancelInput,
  sessionEditInput,
  sessionRescheduleInput,
  sessionSubstituteInput,
  templateInput,
} from "@/lib/validation/schedule";
import { audit } from "../audit";
import { AppError, notFound } from "../errors";
import { type Actor, allowedClassIds, assertAdmin, assertSessionAccess, isAdmin } from "../guard";
import { createRow, deleteRow } from "./crud";

const substitute = alias(teachers, "substitute");

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
  kind: sessions.kind,
  status: sessions.status,
  content: sessions.content,
  note: sessions.note,
  attendanceUnlockedUntil: sessions.attendanceUnlockedUntil,
  attendanceCount: sql<number>`(select count(*)::int from ${attendances} where ${attendances.sessionId} = ${sessions.id})`,
};

function sessionQuery() {
  return db
    .select(sessionColumns)
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .leftJoin(timeSlots, eq(timeSlots.id, sessions.timeSlotId))
    .leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .leftJoin(teachers, eq(teachers.id, sessions.teacherId))
    .leftJoin(substitute, eq(substitute.id, sessions.substituteTeacherId));
}

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

/** Admin xem mọi buổi; GV chỉ thấy buổi của lớp mình và buổi mình dạy/dạy thay. */
export async function listSessions(actor: Actor, filters: SessionFilters): Promise<SessionRow[]> {
  const conditions = [between(sessions.date, filters.from, filters.to)];
  if (filters.classId) conditions.push(eq(sessions.classId, filters.classId));
  if (filters.roomId) conditions.push(eq(sessions.roomId, filters.roomId));
  if (filters.teacherId) {
    conditions.push(or(eq(sessions.teacherId, filters.teacherId), eq(sessions.substituteTeacherId, filters.teacherId))!);
  }

  if (!isAdmin(actor)) {
    if (!actor.teacherId) return [];
    const mine = or(eq(sessions.teacherId, actor.teacherId), eq(sessions.substituteTeacherId, actor.teacherId))!;
    const allowed = (await allowedClassIds(actor)) ?? [];
    conditions.push(filters.personal || allowed.length === 0 ? mine : or(mine, inArray(sessions.classId, allowed))!);
  }

  return sessionQuery()
    .where(and(...conditions))
    .orderBy(asc(sessions.date), asc(sessions.startTime));
}

export async function getSession(actor: Actor, sessionId: string): Promise<SessionRow> {
  await assertSessionAccess(actor, sessionId);
  const [row] = await sessionQuery().where(eq(sessions.id, sessionId)).limit(1);
  if (!row) throw notFound("buổi học");
  return row;
}

// ---------- Lịch mẫu ----------

export async function listTemplates(actor: Actor, classId: string) {
  assertAdmin(actor);
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
    })
    .from(scheduleTemplates)
    .innerJoin(timeSlots, eq(timeSlots.id, scheduleTemplates.timeSlotId))
    .leftJoin(rooms, eq(rooms.id, scheduleTemplates.roomId))
    .leftJoin(teachers, eq(teachers.id, scheduleTemplates.teacherId))
    .where(eq(scheduleTemplates.classId, classId))
    .orderBy(asc(scheduleTemplates.weekday), asc(timeSlots.defaultStart));
}

export const createTemplate = (actor: Actor, data: z.output<typeof templateInput>) =>
  createRow(actor, scheduleTemplates, "schedule_templates", data);
/** Xóa dòng lịch mẫu không xóa các buổi đã sinh (template_id của buổi thành null). */
export const deleteTemplate = (actor: Actor, id: string) => deleteRow(actor, scheduleTemplates, "schedule_templates", id);

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
      teacherId: sql<string | null>`coalesce(${sessions.substituteTeacherId}, ${sessions.teacherId})`,
      label: classes.code,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .where(and(between(sessions.date, from, to), ne(sessions.status, "cancelled")));
  return rows;
}

type Candidate = {
  id?: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  /** GV thực dạy (đã tính dạy thay). */
  teacherId: string | null;
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
};

/**
 * Sinh buổi học từ lịch mẫu trong khoảng ngày của lớp, bỏ ngày nghỉ.
 * Chạy lại nhiều lần an toàn: buổi đã có (kể cả đã dời/sửa giờ) không bị tạo lại hay ghi đè.
 * Buổi trùng GV/phòng không được tạo và được trả về trong `conflicts`.
 */
export async function generateSessions(actor: Actor, classId: string): Promise<GenerationResult> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
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
      })
      .from(scheduleTemplates)
      .innerJoin(timeSlots, eq(timeSlots.id, scheduleTemplates.timeSlotId))
      .where(eq(scheduleTemplates.classId, classId));
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
      startDate: cls.startDate,
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
      const conflicts = findConflicts(p, busy);
      if (conflicts.length > 0) {
        result.conflicts.push({ date: p.date, startTime: p.startTime, reason: [...new Set(conflicts.map(describeConflict))].join("; ") });
        continue;
      }
      toInsert.push({ ...p, classId, kind: "regular", status: "planned" });
      // Buổi vừa lên kế hoạch cũng chiếm GV/phòng đối với các buổi sau trong cùng lần sinh.
      busy.push({ id: `new-${toInsert.length}`, label: cls.code, ...p });
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
      newValue: { created: result.created, conflicts: result.conflicts.length },
    });
    return result;
  });
}

// ---------- Điều chỉnh từng buổi ----------

async function loadForChange(tx: Tx, sessionId: string) {
  const [row] = await tx.select().from(sessions).where(eq(sessions.id, sessionId)).for("update").limit(1);
  if (!row) throw notFound("buổi học");
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
    assertNoConflict(
      {
        id: before.id,
        date: next.date,
        startTime: next.startTime,
        endTime: next.endTime,
        roomId: next.roomId ?? null,
        teacherId: next.substituteTeacherId ?? next.teacherId ?? null,
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
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const { id, ...patch } = input;
    const before = await loadForChange(tx, id);
    if (before.status === "cancelled") throw new AppError("CONFLICT", "Buổi đã hủy. Hãy khôi phục trước khi sửa.");
    return applyChange(tx, actor, before, patch, "session_updated");
  });
}

/** Dời buổi sang ngày/giờ khác; lưu ngày gốc lần đầu dời. */
export async function rescheduleSession(actor: Actor, input: z.output<typeof sessionRescheduleInput>): Promise<ScheduleResult> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const before = await loadForChange(tx, input.id);
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
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const before = await loadForChange(tx, input.id);
    if (before.status === "cancelled") throw new AppError("CONFLICT", "Buổi này đã hủy.");
    if (before.status === "done") throw new AppError("CONFLICT", "Buổi đã điểm danh nên không thể hủy.");
    return applyChange(tx, actor, before, { status: "cancelled", note: input.note ?? before.note }, "session_cancelled");
  });
}

export async function restoreSession(actor: Actor, sessionId: string): Promise<ScheduleResult> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const before = await loadForChange(tx, sessionId);
    if (before.status !== "cancelled") throw new AppError("CONFLICT", "Buổi này không ở trạng thái đã hủy.");
    return applyChange(tx, actor, before, { status: "planned" }, "session_restored");
  });
}

/** Phân GV dạy thay: giữ GV gốc, lưu thêm GV thay. Để trống = bỏ dạy thay. */
export async function setSubstitute(actor: Actor, input: z.output<typeof sessionSubstituteInput>): Promise<ScheduleResult> {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    await lockSchedule(tx);
    const before = await loadForChange(tx, input.id);
    if (before.status === "cancelled") throw new AppError("CONFLICT", "Buổi đã hủy.");
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
  assertAdmin(actor);
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
      { date: input.date, startTime: input.startTime, endTime: input.endTime, roomId: input.roomId, teacherId: input.teacherId },
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
  assertAdmin(actor);
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
    assertNoConflict(candidate, await loadBusy(tx, input.date, input.date));

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