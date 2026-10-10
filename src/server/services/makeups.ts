import { and, asc, between, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { z } from "zod";
import { db } from "@/db";
import { attendances, classes, enrollments, makeupAssignments, sessions, students, teachers } from "@/db/schema";
import { MAKEUP_AHEAD_DAYS, MAKEUP_LOOKBACK_DAYS, canAssignMakeup, isAbsence, makeupState } from "@/domain/makeup";
import { addDays } from "@/lib/dates";
import { todayIso } from "@/lib/format";
import type { makeupAssignInput } from "@/lib/validation/entities";
import { audit } from "../audit";
import { AppError, notFound, translateDbError } from "../errors";
import { type Actor, allowedClassIds, assertCan, assertClassAccess } from "../guard";
import { sessionRoster } from "./attendance";

const makeupSession = alias(sessions, "makeup_session");
const makeupClass = alias(classes, "makeup_class");
const makeupAttendance = alias(attendances, "makeup_attendance");
const substituteTeacher = alias(teachers, "substitute");

/**
 * Các buổi vắng (có phép, không phép) cần học bù: trong 90 ngày gần đây, của học viên đang học ở lớp đang mở
 * trong phạm vi của người dùng. Buổi đã bù xong không còn trong danh sách.
 */
export async function listMakeupNeeds(actor: Actor, today: string = todayIso()) {
  assertCan(actor, "enrollments", "view");
  const allowed = await allowedClassIds(actor);
  if (allowed && allowed.length === 0) return [];
  const rows = await db
    .select({
      absentSessionId: sessions.id,
      studentId: students.id,
      studentCode: students.code,
      studentName: students.fullName,
      classId: classes.id,
      classCode: classes.code,
      date: sessions.date,
      startTime: sessions.startTime,
      lesson: sessions.content,
      status: attendances.status,
      assignmentId: makeupAssignments.id,
      makeupDate: makeupSession.date,
      makeupStartTime: makeupSession.startTime,
      makeupSessionStatus: makeupSession.status,
      makeupClassCode: makeupClass.code,
      makeupAttendance: makeupAttendance.status,
    })
    .from(attendances)
    .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(students, eq(students.id, attendances.studentId))
    .leftJoin(makeupAssignments, and(eq(makeupAssignments.absentSessionId, sessions.id), eq(makeupAssignments.studentId, attendances.studentId)))
    .leftJoin(makeupSession, eq(makeupSession.id, makeupAssignments.makeupSessionId))
    .leftJoin(makeupClass, eq(makeupClass.id, makeupSession.classId))
    .leftJoin(makeupAttendance, and(eq(makeupAttendance.sessionId, makeupSession.id), eq(makeupAttendance.studentId, attendances.studentId)))
    .where(
      and(
        inArray(attendances.status, ["absent", "excused"]),
        between(sessions.date, addDays(today, -MAKEUP_LOOKBACK_DAYS), today),
        ne(sessions.status, "cancelled"),
        eq(sessions.kind, "regular"),
        eq(classes.status, "open"),
        eq(classes.timetableOnly, false),
        allowed ? inArray(classes.id, allowed) : undefined,
        // Chỉ học viên còn đang học lớp đó.
        sql`exists (
          select 1 from ${enrollments}
          where ${enrollments.classId} = ${classes.id} and ${enrollments.studentId} = ${attendances.studentId} and ${enrollments.status} = 'active'
        )`,
        // Vắng ở chính buổi học bù thì theo dõi ở buổi vắng gốc, không sinh thêm một buổi cần bù nữa.
        sql`not exists (
          select 1 from makeup_assignments m
          where m.makeup_session_id = ${attendances.sessionId} and m.student_id = ${attendances.studentId}
        )`,
      ),
    )
    .orderBy(asc(students.fullName), asc(students.code), desc(sessions.date))
    .limit(300);
  return rows
    .map(({ makeupSessionStatus, makeupAttendance: attended, ...row }) => ({
      ...row,
      state: makeupState(row.assignmentId && makeupSessionStatus ? { sessionStatus: makeupSessionStatus, attendance: attended } : null),
    }))
    .filter((row) => row.state !== "done");
}

/**
 * Các buổi có thể xếp học bù: buổi thường chưa dạy trong 4 tuần tới của lớp đang mở trong phạm vi của người dùng,
 * kèm sĩ số hiện tại (học viên của lớp + các em đã xếp học bù vào buổi đó).
 */
export async function listMakeupTargets(actor: Actor, today: string = todayIso()) {
  assertCan(actor, "enrollments", "add");
  const allowed = await allowedClassIds(actor);
  if (allowed && allowed.length === 0) return [];
  return db
    .select({
      id: sessions.id,
      classId: classes.id,
      classCode: classes.code,
      className: classes.name,
      date: sessions.date,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
      teacherName: sql<string | null>`coalesce(
        nullif(${substituteTeacher.shortName}, ''), ${substituteTeacher.fullName}, nullif(${teachers.shortName}, ''), ${teachers.fullName}
      )`,
      maxSize: classes.maxSize,
      headcount: sql<number>`(
        (select count(*) from ${enrollments} where ${enrollments.classId} = ${classes.id} and ${enrollments.status} = 'active')
        + (select count(*) from makeup_assignments m where m.makeup_session_id = ${sessions.id})
      )::int`,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .leftJoin(teachers, eq(teachers.id, sessions.teacherId))
    .leftJoin(substituteTeacher, eq(substituteTeacher.id, sessions.substituteTeacherId))
    .where(
      and(
        between(sessions.date, today, addDays(today, MAKEUP_AHEAD_DAYS)),
        eq(sessions.status, "planned"),
        eq(sessions.kind, "regular"),
        eq(classes.status, "open"),
        eq(classes.timetableOnly, false),
        allowed ? inArray(classes.id, allowed) : undefined,
      ),
    )
    .orderBy(asc(sessions.date), asc(sessions.startTime), asc(classes.code));
}

/** Lớp đang học của từng học viên (để không gợi ý buổi của chính lớp em đang học khi xếp bù). */
export async function activeClassIdsOf(studentIds: string[]): Promise<Record<string, string[]>> {
  if (studentIds.length === 0) return {};
  const rows = await db
    .select({ studentId: enrollments.studentId, classId: enrollments.classId })
    .from(enrollments)
    .where(and(inArray(enrollments.studentId, studentIds), eq(enrollments.status, "active")));
  const out: Record<string, string[]> = {};
  for (const row of rows) (out[row.studentId] ??= []).push(row.classId);
  return out;
}

/**
 * Xếp một buổi vắng của học viên vào học bù ở một buổi có sẵn. Buổi vắng đã xếp mà em lại vắng buổi bù,
 * hoặc buổi bù đã bị hủy, thì lượt xếp cũ được thay bằng lượt mới.
 */
export async function assignMakeup(actor: Actor, input: z.output<typeof makeupAssignInput>, now: Date = new Date()) {
  assertCan(actor, "enrollments", "add");
  const today = todayIso(now);
  try {
    return await db.transaction(async (tx) => {
      const [absence] = await tx
        .select({ status: attendances.status, classId: sessions.classId, kind: sessions.kind })
        .from(attendances)
        .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
        .where(and(eq(attendances.sessionId, input.absentSessionId), eq(attendances.studentId, input.studentId)))
        .limit(1);
      // Kiểm tra phạm vi trước khi tiết lộ thông tin về buổi vắng.
      if (!absence) throw notFound("buổi vắng");
      await assertClassAccess(actor, absence.classId, tx);
      if (!isAbsence(absence.status)) throw new AppError("CONFLICT", "Học viên không vắng buổi này nên không cần học bù.");

      // Khóa buổi học bù: không xếp trùng lúc buổi đang được điểm danh.
      const [target] = await tx.select().from(sessions).where(eq(sessions.id, input.makeupSessionId)).for("update").limit(1);
      if (!target) throw notFound("buổi học bù");
      await assertClassAccess(actor, target.classId, tx);
      const [targetClass] = await tx
        .select({ status: classes.status, timetableOnly: classes.timetableOnly })
        .from(classes)
        .where(eq(classes.id, target.classId))
        .limit(1);
      if (target.id === input.absentSessionId) throw new AppError("VALIDATION", "Buổi học bù phải khác buổi đã vắng.");
      if (targetClass?.timetableOnly) throw new AppError("CONFLICT", "Lớp chỉ hiển thị trên Thời khóa biểu không nhận học viên học bù.");
      if (targetClass?.status !== "open") throw new AppError("CONFLICT", "Lớp của buổi học bù đã đóng.");
      if (target.status !== "planned") throw new AppError("CONFLICT", "Chỉ xếp học bù vào buổi chưa dạy và chưa hủy.");
      if (target.date < today) throw new AppError("CONFLICT", "Buổi học bù đã qua ngày.");
      const roster = await sessionRoster(tx, target);
      if (roster.some((r) => r.studentId === input.studentId)) {
        throw new AppError("CONFLICT", "Học viên đã có tên trong buổi này.");
      }

      const [existing] = await tx
        .select({
          id: makeupAssignments.id,
          sessionStatus: makeupSession.status,
          attendance: makeupAttendance.status,
        })
        .from(makeupAssignments)
        .innerJoin(makeupSession, eq(makeupSession.id, makeupAssignments.makeupSessionId))
        .leftJoin(makeupAttendance, and(eq(makeupAttendance.sessionId, makeupSession.id), eq(makeupAttendance.studentId, makeupAssignments.studentId)))
        .where(and(eq(makeupAssignments.absentSessionId, input.absentSessionId), eq(makeupAssignments.studentId, input.studentId)))
        .limit(1);
      if (existing) {
        if (!canAssignMakeup(makeupState(existing))) throw new AppError("CONFLICT", "Buổi vắng này đã được xếp học bù.");
        await tx.delete(makeupAssignments).where(eq(makeupAssignments.id, existing.id));
      }
      const [row] = await tx
        .insert(makeupAssignments)
        .values({ absentSessionId: input.absentSessionId, makeupSessionId: target.id, studentId: input.studentId, createdBy: actor.userId })
        .returning();
      await audit(tx, {
        userId: actor.userId,
        action: "makeup_assigned",
        tableName: "makeup_assignments",
        recordId: row!.id,
        newValue: { absentSessionId: row!.absentSessionId, makeupSessionId: row!.makeupSessionId, studentId: row!.studentId, replaced: existing?.id ?? null },
      });
      return row!;
    });
  } catch (e) {
    throw translateDbError(e);
  }
}

/** Hủy một lượt xếp học bù khi buổi bù chưa điểm danh cho học viên đó. */
export async function cancelMakeup(actor: Actor, id: string) {
  assertCan(actor, "enrollments", "edit");
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        id: makeupAssignments.id,
        absentSessionId: makeupAssignments.absentSessionId,
        makeupSessionId: makeupAssignments.makeupSessionId,
        studentId: makeupAssignments.studentId,
        classId: sessions.classId,
      })
      .from(makeupAssignments)
      .innerJoin(sessions, eq(sessions.id, makeupAssignments.absentSessionId))
      .where(eq(makeupAssignments.id, id))
      .limit(1);
    if (!row) throw notFound("lượt xếp học bù");
    await assertClassAccess(actor, row.classId, tx);
    const [recorded] = await tx
      .select({ id: attendances.id })
      .from(attendances)
      .where(and(eq(attendances.sessionId, row.makeupSessionId), eq(attendances.studentId, row.studentId)))
      .limit(1);
    if (recorded) throw new AppError("CONFLICT", "Buổi học bù đã điểm danh nên không hủy được.");
    await tx.delete(makeupAssignments).where(eq(makeupAssignments.id, id));
    await audit(tx, {
      userId: actor.userId,
      action: "makeup_cancelled",
      tableName: "makeup_assignments",
      recordId: id,
      oldValue: { absentSessionId: row.absentSessionId, makeupSessionId: row.makeupSessionId, studentId: row.studentId },
    });
    return { id };
  });
}
