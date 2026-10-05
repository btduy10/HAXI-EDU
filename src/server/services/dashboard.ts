import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { attendances, classes, enrollments, sessions, starLogs, students, teachers } from "@/db/schema";
import { addDays, startOfWeek } from "@/lib/dates";
import { todayIso } from "@/lib/format";
import { type Actor, allowedClassIds, assertAdmin } from "../guard";
import { loadLevels, progressOf } from "./stars";

export async function adminOverview(actor: Actor) {
  assertAdmin(actor);
  const [[s], [t], [c]] = await Promise.all([
    db.select({ n: count() }).from(students).where(eq(students.status, "active")),
    db.select({ n: count() }).from(teachers).where(eq(teachers.status, "active")),
    db.select({ n: count() }).from(classes).where(eq(classes.status, "open")),
  ]);
  return { activeStudents: s?.n ?? 0, activeTeachers: t?.n ?? 0, openClasses: c?.n ?? 0 };
}

export type AttendanceBreakdown = { present: number; late: number; left_early: number; excused: number; absent: number };
const EMPTY_BREAKDOWN: AttendanceBreakdown = { present: 0, late: 0, left_early: 0, excused: 0, absent: 0 };

export type DashboardCharts = {
  /** Số lượt điểm danh theo trạng thái trong 30 ngày qua. */
  attendance: AttendanceBreakdown;
  /** Tỷ lệ có đi học (có mặt + trễ + về sớm) trên các lượt điểm danh, theo từng lớp đang mở. */
  classRates: { classId: string; code: string; name: string; rate: number; total: number }[];
  /** Tổng sao ghi nhận (thưởng trừ phạt) theo tuần, 8 tuần gần nhất, cũ → mới. */
  starsByWeek: { weekStart: string; stars: number }[];
  /** Số học viên đang học ở mỗi cấp bậc. */
  levels: { levelNo: number; name: string; frameColor: string; students: number }[];
};

const WEEKS = 8;

/** Số liệu biểu đồ trang Tổng quan. Admin: toàn trung tâm; GV: chỉ các lớp được phân công. */
export async function dashboardCharts(actor: Actor, now: Date = new Date()): Promise<DashboardCharts> {
  const allowed = await allowedClassIds(actor);
  const levelList = await loadLevels();
  const emptyLevels = levelList.map((l) => ({ levelNo: l.levelNo, name: l.name, frameColor: l.frameColor, students: 0 }));
  const today = todayIso(now);
  const firstWeek = addDays(startOfWeek(today), -7 * (WEEKS - 1));
  const weeks = Array.from({ length: WEEKS }, (_, i) => addDays(firstWeek, i * 7));
  if (allowed && allowed.length === 0) {
    return { attendance: EMPTY_BREAKDOWN, classRates: [], starsByWeek: weeks.map((weekStart) => ({ weekStart, stars: 0 })), levels: emptyLevels };
  }
  const inScope = allowed ? inArray(sessions.classId, allowed) : undefined;
  const since = addDays(today, -30);
  const attended = sql<number>`count(*) filter (where ${attendances.status} in ('present', 'late', 'left_early'))::int`;

  const [statusRows, rateRows, starRows, studentRows] = await Promise.all([
    db
      .select({ status: attendances.status, n: count() })
      .from(attendances)
      .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
      .where(and(gte(sessions.date, since), eq(sessions.status, "done"), inScope))
      .groupBy(attendances.status),
    db
      .select({ classId: classes.id, code: classes.code, name: classes.name, attended, total: sql<number>`count(*)::int` })
      .from(attendances)
      .innerJoin(sessions, eq(sessions.id, attendances.sessionId))
      .innerJoin(classes, eq(classes.id, sessions.classId))
      .where(and(eq(sessions.status, "done"), eq(classes.status, "open"), inScope))
      .groupBy(classes.id, classes.code, classes.name)
      .orderBy(classes.code),
    // Gom theo tuần của NGÀY HỌC (buổi học), không theo lúc bấm ghi.
    db
      .select({
        weekStart: sql<string>`to_char(date_trunc('week', ${sessions.date}), 'YYYY-MM-DD')`,
        stars: sql<number>`coalesce(sum(${starLogs.stars}), 0)::int`,
      })
      .from(starLogs)
      .innerJoin(sessions, eq(sessions.id, starLogs.sessionId))
      .where(and(gte(sessions.date, firstWeek), inScope))
      .groupBy(sql`date_trunc('week', ${sessions.date})`),
    allowed
      ? db
          .selectDistinct({ id: students.id })
          .from(students)
          .innerJoin(enrollments, and(eq(enrollments.studentId, students.id), eq(enrollments.status, "active")))
          .where(and(eq(students.status, "active"), inArray(enrollments.classId, allowed)))
      : db.select({ id: students.id }).from(students).where(eq(students.status, "active")),
  ]);

  const attendance = { ...EMPTY_BREAKDOWN };
  for (const row of statusRows) attendance[row.status] = row.n;

  const starsOf = new Map(starRows.map((r) => [r.weekStart, r.stars]));
  const progress = await progressOf(db, studentRows.map((s) => s.id));
  const perLevel = new Map<number, number>();
  for (const p of progress.values()) perLevel.set(p.level.levelNo, (perLevel.get(p.level.levelNo) ?? 0) + 1);

  return {
    attendance,
    classRates: rateRows.map((r) => ({
      classId: r.classId,
      code: r.code,
      name: r.name,
      total: r.total,
      rate: r.total === 0 ? 0 : Math.round((r.attended / r.total) * 1000) / 10,
    })),
    starsByWeek: weeks.map((weekStart) => ({ weekStart, stars: starsOf.get(weekStart) ?? 0 })),
    levels: emptyLevels.map((l) => ({ ...l, students: perLevel.get(l.levelNo) ?? 0 })),
  };
}
