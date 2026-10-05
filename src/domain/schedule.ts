import { addDays, eachDay, isoWeekday } from "@/lib/dates";

// Quy tắc thuần của thời khóa biểu: sinh buổi, chồng lấn giờ, khóa điểm danh.

const hhmm = (time: string) => time.slice(0, 5);

/** Hai khoảng giờ [start, end) trong cùng một ngày có chồng lấn không. Chạm mép (09:30–09:30) không tính. */
export function timesOverlap(aStart: string, aEnd: string, bStart: string, bEnd: string): boolean {
  return hhmm(aStart) < hhmm(bEnd) && hhmm(bStart) < hhmm(aEnd);
}

export type TemplateForGeneration = {
  id: string;
  weekday: number;
  timeSlotId: string;
  slotStart: string;
  slotEnd: string;
  /** Giờ riêng của dòng lịch mẫu; null = dùng giờ mặc định của ca. */
  startTime: string | null;
  endTime: string | null;
  roomId: string | null;
  teacherId: string | null;
};

export type PlannedSession = {
  templateId: string;
  date: string;
  timeSlotId: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  teacherId: string | null;
};

/**
 * Sinh danh sách buổi từ lịch mẫu trong khoảng ngày của lớp, bỏ qua ngày nghỉ.
 * Giờ được SAO CHÉP vào từng buổi nên sửa ca hay sửa buổi khác về sau không ảnh hưởng.
 */
export function planSessions(input: {
  startDate: string;
  endDate: string;
  templates: TemplateForGeneration[];
  holidays: ReadonlySet<string>;
  defaultRoomId: string | null;
  defaultTeacherId: string | null;
}): PlannedSession[] {
  const byWeekday = new Map<number, TemplateForGeneration[]>();
  for (const t of input.templates) byWeekday.set(t.weekday, [...(byWeekday.get(t.weekday) ?? []), t]);

  const planned: PlannedSession[] = [];
  for (const date of eachDay(input.startDate, input.endDate)) {
    if (input.holidays.has(date)) continue;
    for (const t of byWeekday.get(isoWeekday(date)) ?? []) {
      planned.push({
        templateId: t.id,
        date,
        timeSlotId: t.timeSlotId,
        startTime: hhmm(t.startTime ?? t.slotStart),
        endTime: hhmm(t.endTime ?? t.slotEnd),
        roomId: t.roomId ?? input.defaultRoomId,
        teacherId: t.teacherId ?? input.defaultTeacherId,
      });
    }
  }
  return planned;
}

export type BusySession = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  /** GV thực dạy: GV dạy thay nếu có, nếu không là GV của buổi. */
  teacherId: string | null;
  label: string;
};

export type Conflict = { kind: "teacher" | "room"; with: BusySession };

/** Tìm xung đột GV/phòng theo khoảng giờ THỰC TẾ (không theo tên ca). */
export function findConflicts(
  candidate: { id?: string; date: string; startTime: string; endTime: string; roomId: string | null; teacherId: string | null },
  others: BusySession[],
): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const other of others) {
    if (other.id === candidate.id || other.date !== candidate.date) continue;
    if (!timesOverlap(candidate.startTime, candidate.endTime, other.startTime, other.endTime)) continue;
    if (candidate.teacherId && candidate.teacherId === other.teacherId) conflicts.push({ kind: "teacher", with: other });
    if (candidate.roomId && candidate.roomId === other.roomId) conflicts.push({ kind: "room", with: other });
  }
  return conflicts;
}

export function describeConflict(c: Conflict): string {
  const what = c.kind === "teacher" ? "Giáo viên" : "Phòng";
  return `${what} đã có buổi ${c.with.label} lúc ${hhmm(c.with.startTime)}–${hhmm(c.with.endTime)}`;
}

/**
 * Điểm danh bị khóa khi đã quá N ngày kể từ ngày học, trừ khi Admin mở khóa còn hiệu lực.
 * Ví dụ N = 7: buổi ngày 01 sửa được đến hết ngày 08.
 */
export function isAttendanceLocked(input: {
  sessionDate: string;
  today: string;
  lockDays: number;
  unlockedUntil: Date | null;
  now: Date;
}): boolean {
  if (input.unlockedUntil && input.unlockedUntil > input.now) return false;
  return input.today > addDays(input.sessionDate, input.lockDays);
}

/** Học viên thuộc danh sách điểm danh nếu ghi danh còn hiệu lực tại ngày học. */
export function isEnrolledOn(enrollment: { joinedAt: string; leftAt: string | null }, date: string): boolean {
  return enrollment.joinedAt <= date && (enrollment.leftAt === null || enrollment.leftAt > date);
}
