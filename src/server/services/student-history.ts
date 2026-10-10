import { and, desc, eq, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { attendances, classes, courses, enrollments, makeupAssignments, sessions } from "@/db/schema";
import { isAbsence, makeupState } from "@/domain/makeup";
import { type Actor, allowedClassIds } from "../guard";
import { assertStudentAccess, starTotalsOf } from "./stars";
import { listStudentsPage } from "./students";

const madeUpIn = alias(makeupAssignments, "made_up_in");
const makeupSession = alias(sessions, "makeup_session");
const makeupAttendance = alias(attendances, "makeup_attendance");
const guestOf = alias(makeupAssignments, "guest_of");

/**
 * Lịch sử học của một học viên, để giáo viên biết em đã học gì và không dạy trùng chương trình:
 * - `programs`: từng lớp/khóa em đã và đang học, kèm số buổi có mặt trên số buổi lớp đã dạy trong thời gian em học.
 * - `sessions`: từng buổi đã điểm danh, kèm tên bài đã dạy.
 * Người xem được học viên thì xem được lịch sử ở MỌI lớp của em (chỉ ngày, lớp, tên bài, có mặt/vắng);
 * số sao của buổi chỉ có với lớp trong phạm vi của người xem.
 */
export async function getStudentLearningHistory(actor: Actor, studentId: string) {
  await assertStudentAccess(actor, studentId);
  const allowed = await allowedClassIds(actor);
  const inScope = (classId: string) => allowed === null || allowed.includes(classId);
  const attendedIn = sql`${attendances.status} in ('present', 'late', 'left_early')`;
  const [programs, history] = await Promise.all([
    db
      .select({
        enrollmentId: enrollments.id,
        classId: classes.id,
        classCode: classes.code,
        className: classes.name,
        courseName: courses.name,
        joinedAt: enrollments.joinedAt,
        leftAt: enrollments.leftAt,
        status: enrollments.status,
        classStatus: classes.status,
        // Buổi lớp đã dạy trong thời gian em học, và số buổi em có mặt trong các buổi đó.
        taught: sql<number>`(
          select count(*)::int from sessions s
          where s.class_id = ${classes.id} and s.status = 'done' and s.kind = 'regular'
            and s.date >= ${enrollments.joinedAt} and (${enrollments.leftAt} is null or s.date < ${enrollments.leftAt})
        )`,
        attended: sql<number>`(
          select count(*)::int from attendances a
          inner join sessions s on s.id = a.session_id
          where a.student_id = ${enrollments.studentId} and s.class_id = ${classes.id} and s.status = 'done' and s.kind = 'regular'
            and a.status in ('present', 'late', 'left_early')
            and s.date >= ${enrollments.joinedAt} and (${enrollments.leftAt} is null or s.date < ${enrollments.leftAt})
        )`,
      })
      .from(enrollments)
      .innerJoin(classes, eq(classes.id, enrollments.classId))
      .innerJoin(courses, eq(courses.id, classes.courseId))
      .where(eq(enrollments.studentId, studentId))
      .orderBy(desc(enrollments.joinedAt), desc(enrollments.createdAt)),
    db
      .select({
        sessionId: sessions.id,
        classId: classes.id,
        date: sessions.date,
        startTime: sessions.startTime,
        classCode: classes.code,
        courseName: courses.name,
        lesson: sessions.content,
        status: attendances.status,
        // Em học buổi này với tư cách học bù (học ghép từ lớp khác).
        isMakeup: sql<boolean>`${guestOf.id} is not null`,
        makeupAssigned: sql<boolean>`${madeUpIn.id} is not null`,
        makeupDate: makeupSession.date,
        makeupSessionStatus: makeupSession.status,
        makeupAttendance: makeupAttendance.status,
        stars: sql<number>`coalesce((select sum(l.stars) from star_logs l where l.session_id = ${sessions.id} and l.student_id = ${attendances.studentId}), 0)::int`,
        attended: sql<boolean>`${attendedIn}`,
      })
      .from(attendances)
      .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
      .innerJoin(classes, eq(classes.id, sessions.classId))
      .innerJoin(courses, eq(courses.id, classes.courseId))
      .leftJoin(guestOf, and(eq(guestOf.makeupSessionId, sessions.id), eq(guestOf.studentId, attendances.studentId)))
      .leftJoin(madeUpIn, and(eq(madeUpIn.absentSessionId, sessions.id), eq(madeUpIn.studentId, attendances.studentId)))
      .leftJoin(makeupSession, eq(makeupSession.id, madeUpIn.makeupSessionId))
      .leftJoin(makeupAttendance, and(eq(makeupAttendance.sessionId, makeupSession.id), eq(makeupAttendance.studentId, attendances.studentId)))
      .where(and(eq(attendances.studentId, studentId), ne(sessions.status, "cancelled")))
      .orderBy(desc(sessions.date), desc(sessions.startTime))
      .limit(300),
  ]);
  return {
    programs,
    sessions: history.map(({ classId, makeupAssigned, makeupSessionStatus, makeupAttendance: madeUp, stars, ...row }) => ({
      ...row,
      // Sao của buổi chỉ hiện với lớp trong phạm vi của người xem.
      stars: inScope(classId) ? stars : null,
      // Buổi vắng: đã xếp bù / đã bù hay chưa.
      makeup: isAbsence(row.status) ? makeupState(makeupAssigned && makeupSessionStatus ? { sessionStatus: makeupSessionStatus, attendance: madeUp } : null) : null,
    })),
  };
}

/** Danh sách học viên theo trang kèm tổng sao tích lũy của từng em. */
export async function listStudentsPageWithStars(actor: Actor, search: string | undefined, page: number) {
  const result = await listStudentsPage(actor, search, page);
  const totals = await starTotalsOf(db, result.rows.map((s) => s.id));
  return { ...result, rows: result.rows.map((s) => ({ ...s, stars: totals.get(s.id) ?? 0 })) };
}
