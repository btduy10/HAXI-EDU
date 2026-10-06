import { and, asc, between, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { classes, courses, rooms, sessions, teachers } from "@/db/schema";
import { todayIso } from "@/lib/format";
import { type Actor, assertCan, seesAllClasses } from "../guard";

export type TimesheetFilters = {
  from: string;
  to: string;
  teacherId?: string | null;
  classId?: string | null;
};

/** taught = đã dạy (đã điểm danh) → được tính công; pending = đã qua ngày nhưng chưa điểm danh; upcoming = chưa tới ngày. */
export type TimesheetState = "taught" | "pending" | "upcoming";

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/**
 * Chấm công giáo viên: các buổi trong khoảng ngày, tính cho người THỰC DẠY (GV dạy thay nếu có, không thì GV của buổi).
 * Buổi đã hủy không tính. Chỉ buổi đã điểm danh mới được tính là một công.
 * Phạm vi "lớp của mình": chỉ thấy công của chính mình.
 */
export async function teacherTimesheet(actor: Actor, filters: TimesheetFilters, now: Date = new Date()) {
  assertCan(actor, "timesheet", "view");
  const ownOnly = !seesAllClasses(actor);
  if (ownOnly && !actor.teacherId) return { rows: [], summary: [] };
  const effectiveTeacherId = sql<string>`coalesce(${sessions.substituteTeacherId}, ${sessions.teacherId})`;
  const conditions = [
    between(sessions.date, filters.from, filters.to),
    ne(sessions.status, "cancelled"),
    isNotNull(effectiveTeacherId),
  ];
  const teacherId = ownOnly ? actor.teacherId : filters.teacherId;
  if (teacherId) conditions.push(eq(effectiveTeacherId, teacherId));
  if (filters.classId) conditions.push(eq(sessions.classId, filters.classId));

  const found = await db
    .select({
      id: sessions.id,
      date: sessions.date,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
      status: sessions.status,
      kind: sessions.kind,
      isSubstitute: sql<boolean>`${sessions.substituteTeacherId} is not null`,
      teacherId: teachers.id,
      teacherCode: teachers.code,
      teacherName: teachers.fullName,
      classCode: classes.code,
      className: classes.name,
      courseName: courses.name,
      roomName: rooms.name,
    })
    .from(sessions)
    .innerJoin(teachers, eq(teachers.id, effectiveTeacherId))
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .where(and(...conditions))
    .orderBy(asc(teachers.code), asc(sessions.date), asc(sessions.startTime));

  const today = todayIso(now);
  const rows = found.map((r) => ({
    ...r,
    minutes: Math.max(0, minutesOf(r.endTime) - minutesOf(r.startTime)),
    state: (r.status === "done" ? "taught" : r.date <= today ? "pending" : "upcoming") as TimesheetState,
  }));

  const byTeacher = new Map<
    string,
    { teacherId: string; teacherCode: string; teacherName: string; taught: number; substitute: number; minutes: number; pending: number; upcoming: number }
  >();
  for (const r of rows) {
    const item =
      byTeacher.get(r.teacherId) ??
      { teacherId: r.teacherId, teacherCode: r.teacherCode, teacherName: r.teacherName, taught: 0, substitute: 0, minutes: 0, pending: 0, upcoming: 0 };
    if (r.state === "taught") {
      item.taught += 1;
      item.minutes += r.minutes;
      if (r.isSubstitute) item.substitute += 1;
    } else {
      item[r.state] += 1;
    }
    byTeacher.set(r.teacherId, item);
  }
  return { rows, summary: [...byTeacher.values()] };
}
