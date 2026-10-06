import { and, asc, between, eq, isNotNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { classes, courses, rooms, sessions, teachers } from "@/db/schema";
import { WEEKDAY_LABELS, isoWeekday } from "@/lib/dates";
import { formatDate, formatTime, todayIso } from "@/lib/format";
import type { ExportDoc } from "../export";
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

const STATE_LABEL: Record<TimesheetState, string> = { taught: "Đã dạy", pending: "Chưa điểm danh", upcoming: "Chưa tới ngày" };
const hoursOf = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

/**
 * Tệp chấm công để xuất. Không chọn giáo viên: tệp tổng hợp mọi giáo viên (tổng công + chi tiết).
 * Chọn một giáo viên: tệp riêng của người đó để gửi cho giáo viên xem.
 */
export async function timesheetDoc(actor: Actor, filters: TimesheetFilters, now: Date = new Date()): Promise<ExportDoc> {
  const { rows, summary } = await teacherTimesheet(actor, filters, now);
  const single = filters.teacherId ? (summary[0] ?? null) : null;
  const total = summary.reduce(
    (sum, s) => ({ taught: sum.taught + s.taught, substitute: sum.substitute + s.substitute, minutes: sum.minutes + s.minutes, pending: sum.pending + s.pending }),
    { taught: 0, substitute: 0, minutes: 0, pending: 0 },
  );
  return {
    filename: `cham-cong-${single ? single.teacherCode : "tong-hop"}-${filters.from}-${filters.to}`,
    title: single ? `Chấm công giáo viên ${single.teacherName} (${single.teacherCode})` : "Chấm công giáo viên – tổng hợp",
    subtitle: `Từ ${formatDate(filters.from)} đến ${formatDate(filters.to)}`,
    sections: [
      {
        title: "Tổng công",
        columns: [
          { header: "STT", width: 6, align: "center" },
          { header: "Mã GV", width: 14 },
          { header: "Giáo viên", width: 26 },
          { header: "Số công", width: 10, align: "center" },
          { header: "Trong đó dạy thay", width: 18, align: "center" },
          { header: "Số giờ", width: 10, align: "center" },
          { header: "Chưa điểm danh", width: 16, align: "center" },
        ],
        rows: [
          ...summary.map((s, i) => [i + 1, s.teacherCode, s.teacherName, s.taught, s.substitute, hoursOf(s.minutes), s.pending]),
          ...(summary.length > 1 ? [["", "", "Tổng cộng", total.taught, total.substitute, hoursOf(total.minutes), total.pending]] : []),
        ],
      },
      {
        title: "Chi tiết buổi dạy",
        columns: [
          { header: "STT", width: 6, align: "center" },
          { header: "Thứ", width: 10 },
          { header: "Ngày", width: 12 },
          { header: "Giờ", width: 13 },
          { header: "Mã GV", width: 14 },
          { header: "Giáo viên", width: 24 },
          { header: "Lớp", width: 16 },
          { header: "Khóa học", width: 24 },
          { header: "Phòng", width: 16 },
          { header: "Ghi chú", width: 12 },
          { header: "Trạng thái", width: 16 },
        ],
        rows: rows.map((r, i) => [
          i + 1,
          WEEKDAY_LABELS[isoWeekday(r.date)] ?? "",
          formatDate(r.date),
          `${formatTime(r.startTime)}–${formatTime(r.endTime)}`,
          r.teacherCode,
          r.teacherName,
          r.classCode,
          r.courseName,
          r.roomName ?? "",
          [r.isSubstitute ? "Dạy thay" : "", r.kind === "makeup" ? "Buổi bù" : ""].filter(Boolean).join(", "),
          STATE_LABEL[r.state],
        ]),
      },
    ],
  };
}
