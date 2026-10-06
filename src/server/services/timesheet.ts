import { and, asc, between, eq, inArray, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { classTeachers, classes, courses, rooms, sessions, teachers } from "@/db/schema";
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
/** Vai trò của người được tính công ở một buổi. */
export type TimesheetRole = "main" | "substitute" | "assistant";

export const TIMESHEET_ROLE_LABEL: Record<TimesheetRole, string> = { main: "Dạy chính", substitute: "Dạy thay", assistant: "Trợ giảng" };

const minutesOf = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

export type TimesheetSummary = {
  teacherId: string;
  teacherCode: string;
  teacherName: string;
  /** Số công đứng lớp chính (gồm dạy thay). */
  taught: number;
  substitute: number;
  /** Số công trợ giảng. */
  assistant: number;
  minutes: number;
  pending: number;
  upcoming: number;
  /** Thành tiền = tổng lương/buổi của các công đã dạy có mức lương. */
  amount: number;
  /** Số công đã dạy nhưng chưa có mức lương (không cộng vào thành tiền). */
  missingRate: number;
};

/**
 * Chấm công giáo viên: các buổi trong khoảng ngày. Mỗi buổi tính công cho người THỰC DẠY (GV dạy thay nếu có,
 * không thì GV của buổi) và, nếu có, cho trợ giảng. Buổi đã hủy không tính; chỉ buổi đã điểm danh mới là một công.
 * Lương/buổi lấy theo phân công của GV ở lớp đó (Lớp học → Giáo viên phụ trách).
 * Phạm vi "lớp của mình": chỉ thấy công của chính mình.
 */
export async function teacherTimesheet(actor: Actor, filters: TimesheetFilters, now: Date = new Date()) {
  assertCan(actor, "timesheet", "view");
  const ownOnly = !seesAllClasses(actor);
  if (ownOnly && !actor.teacherId) return { rows: [], summary: [] as TimesheetSummary[] };
  const teacherId = ownOnly ? actor.teacherId : filters.teacherId;

  const conditions = [between(sessions.date, filters.from, filters.to), ne(sessions.status, "cancelled")];
  if (filters.classId) conditions.push(eq(sessions.classId, filters.classId));
  if (teacherId) {
    conditions.push(
      or(eq(sessions.teacherId, teacherId), eq(sessions.substituteTeacherId, teacherId), eq(sessions.assistantTeacherId, teacherId))!,
    );
  }

  const found = await db
    .select({
      id: sessions.id,
      classId: sessions.classId,
      date: sessions.date,
      startTime: sessions.startTime,
      endTime: sessions.endTime,
      status: sessions.status,
      kind: sessions.kind,
      teacherId: sessions.teacherId,
      substituteTeacherId: sessions.substituteTeacherId,
      assistantTeacherId: sessions.assistantTeacherId,
      classCode: classes.code,
      className: classes.name,
      courseName: courses.name,
      roomName: rooms.name,
    })
    .from(sessions)
    .innerJoin(classes, eq(classes.id, sessions.classId))
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .leftJoin(rooms, eq(rooms.id, sessions.roomId))
    .where(and(...conditions))
    .orderBy(asc(sessions.date), asc(sessions.startTime));

  // Mỗi buổi → các dòng công: người thực dạy và trợ giảng.
  const entries = found.flatMap((s) => {
    const list: { teacherId: string; role: TimesheetRole }[] = [];
    const lead = s.substituteTeacherId ?? s.teacherId;
    if (lead) list.push({ teacherId: lead, role: s.substituteTeacherId ? "substitute" : "main" });
    if (s.assistantTeacherId && s.assistantTeacherId !== lead) list.push({ teacherId: s.assistantTeacherId, role: "assistant" });
    return list.filter((e) => !teacherId || e.teacherId === teacherId).map((e) => ({ ...s, ...e }));
  });

  const teacherIds = [...new Set(entries.map((e) => e.teacherId))];
  const classIds = [...new Set(entries.map((e) => e.classId))];
  const [teacherRows, rateRows] = await Promise.all([
    teacherIds.length ? db.select({ id: teachers.id, code: teachers.code, fullName: teachers.fullName }).from(teachers).where(inArray(teachers.id, teacherIds)) : [],
    classIds.length
      ? db
          .select({ classId: classTeachers.classId, teacherId: classTeachers.teacherId, rate: classTeachers.ratePerSession })
          .from(classTeachers)
          .where(and(inArray(classTeachers.classId, classIds), inArray(classTeachers.teacherId, teacherIds)))
      : [],
  ]);
  const teacherOf = new Map(teacherRows.map((t) => [t.id, t]));
  const rateOf = new Map(rateRows.map((r) => [`${r.classId}|${r.teacherId}`, r.rate]));

  const today = todayIso(now);
  const rows = entries
    .map((e) => ({
      ...e,
      key: `${e.id}|${e.role}`,
      teacherCode: teacherOf.get(e.teacherId)?.code ?? "",
      teacherName: teacherOf.get(e.teacherId)?.fullName ?? "",
      isSubstitute: e.role === "substitute",
      rate: rateOf.get(`${e.classId}|${e.teacherId}`) ?? null,
      minutes: Math.max(0, minutesOf(e.endTime) - minutesOf(e.startTime)),
      state: (e.status === "done" ? "taught" : e.date <= today ? "pending" : "upcoming") as TimesheetState,
    }))
    .sort((a, b) => a.teacherCode.localeCompare(b.teacherCode) || a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  const byTeacher = new Map<string, TimesheetSummary>();
  for (const r of rows) {
    const item = byTeacher.get(r.teacherId) ?? {
      teacherId: r.teacherId,
      teacherCode: r.teacherCode,
      teacherName: r.teacherName,
      taught: 0,
      substitute: 0,
      assistant: 0,
      minutes: 0,
      pending: 0,
      upcoming: 0,
      amount: 0,
      missingRate: 0,
    };
    if (r.state === "taught") {
      if (r.role === "assistant") item.assistant += 1;
      else item.taught += 1;
      if (r.role === "substitute") item.substitute += 1;
      item.minutes += r.minutes;
      if (r.rate === null) item.missingRate += 1;
      else item.amount += r.rate;
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
    (sum, s) => ({
      taught: sum.taught + s.taught,
      substitute: sum.substitute + s.substitute,
      assistant: sum.assistant + s.assistant,
      minutes: sum.minutes + s.minutes,
      pending: sum.pending + s.pending,
      amount: sum.amount + s.amount,
    }),
    { taught: 0, substitute: 0, assistant: 0, minutes: 0, pending: 0, amount: 0 },
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
          { header: "Công trợ giảng", width: 15, align: "center" },
          { header: "Số giờ", width: 10, align: "center" },
          { header: "Chưa điểm danh", width: 16, align: "center" },
          { header: "Thành tiền (đ)", width: 16, align: "right" },
          { header: "Ghi chú", width: 26 },
        ],
        rows: [
          ...summary.map((s, i) => [
            i + 1,
            s.teacherCode,
            s.teacherName,
            s.taught,
            s.substitute,
            s.assistant,
            hoursOf(s.minutes),
            s.pending,
            s.amount,
            s.missingRate > 0 ? `${s.missingRate} công chưa có mức lương` : "",
          ]),
          ...(summary.length > 1
            ? [["", "", "Tổng cộng", total.taught, total.substitute, total.assistant, hoursOf(total.minutes), total.pending, total.amount, ""]]
            : []),
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
          { header: "Vai trò", width: 12 },
          { header: "Lớp", width: 16 },
          { header: "Khóa học", width: 24 },
          { header: "Phòng", width: 16 },
          { header: "Ghi chú", width: 12 },
          { header: "Trạng thái", width: 16 },
          { header: "Lương/buổi (đ)", width: 16, align: "right" },
        ],
        rows: rows.map((r, i) => [
          i + 1,
          WEEKDAY_LABELS[isoWeekday(r.date)] ?? "",
          formatDate(r.date),
          `${formatTime(r.startTime)}–${formatTime(r.endTime)}`,
          r.teacherCode,
          r.teacherName,
          TIMESHEET_ROLE_LABEL[r.role],
          r.classCode,
          r.courseName,
          r.roomName ?? "",
          r.kind === "makeup" ? "Buổi bù" : "",
          STATE_LABEL[r.state],
          r.rate ?? "",
        ]),
      },
    ],
  };
}
