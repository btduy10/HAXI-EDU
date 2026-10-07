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
  assistantTeacherId: string | null;
};

export type PlannedSession = {
  templateId: string;
  date: string;
  timeSlotId: string;
  startTime: string;
  endTime: string;
  roomId: string | null;
  teacherId: string | null;
  assistantTeacherId: string | null;
};

/**
 * Sinh danh sách buổi từ lịch mẫu trong khoảng ngày của lớp, bỏ qua ngày nghỉ.
 * Giờ được SAO CHÉP vào từng buổi nên sửa ca hay sửa buổi khác về sau không ảnh hưởng.
 * Buổi đầu tiên luôn vào đúng ngày bắt đầu (khai giảng), kể cả khi ngày đó không trùng thứ của lịch mẫu:
 * buổi này dùng ca, phòng, GV của dòng lịch mẫu có buổi sớm nhất; các buổi sau theo thứ của lịch mẫu.
 */
export function planSessions(input: {
  startDate: string;
  endDate: string;
  templates: TemplateForGeneration[];
  holidays: ReadonlySet<string>;
  defaultRoomId: string | null;
  defaultTeacherId: string | null;
  /** Xếp buổi đầu vào đúng `startDate` (ngày khai giảng của lớp). Tắt khi chỉ sinh tiếp từ một ngày giữa khóa. */
  firstOnStartDate?: boolean;
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
        assistantTeacherId: t.assistantTeacherId,
      });
    }
  }
  const first = planned[0];
  if (input.firstOnStartDate && first && first.date !== input.startDate && !input.holidays.has(input.startDate)) {
    planned.unshift({ ...first, date: input.startDate });
  }
  return planned;
}

export type BusySession = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Ca + Khung giờ của buổi (một dòng Ca học); null = buổi giờ tự do, không gắn ca. */
  timeSlotId: string | null;
  roomId: string | null;
  /** Những người đứng lớp: GV thực dạy (GV dạy thay nếu có, nếu không là GV của buổi) và trợ giảng. */
  teacherIds: string[];
  label: string;
};

/** Danh sách người đứng lớp của một buổi, dùng để kiểm tra trùng lịch. */
export function staffOf(s: { teacherId: string | null; substituteTeacherId?: string | null; assistantTeacherId?: string | null }): string[] {
  const main = s.substituteTeacherId ?? s.teacherId;
  return [...new Set([main, s.assistantTeacherId].filter((id): id is string => Boolean(id)))];
}

/** `sameSlot`: trùng vì cùng Ca + Khung giờ (không phải vì giờ chồng nhau của buổi giờ tự do). */
export type Conflict = { kind: "teacher" | "room"; with: BusySession; sameSlot: boolean };

/**
 * Tìm xung đột GV/phòng. Hai buổi cùng ngày chỉ trùng khi CÙNG Ca + Khung giờ (cùng một dòng Ca học):
 * giáo viên dạy nhiều ca, nhiều khung trong ngày là bình thường, kể cả khi giờ các khung chồng nhau.
 * Buổi không gắn ca (giờ tự do) không có khung để so nên so theo khoảng giờ thực tế.
 */
export function findConflicts(
  candidate: {
    id?: string;
    date: string;
    startTime: string;
    endTime: string;
    timeSlotId: string | null;
    roomId: string | null;
    teacherIds: string[];
  },
  others: BusySession[],
): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const other of others) {
    if (other.id === candidate.id || other.date !== candidate.date) continue;
    const sameSlot = Boolean(candidate.timeSlotId && other.timeSlotId);
    if (sameSlot ? candidate.timeSlotId !== other.timeSlotId : !timesOverlap(candidate.startTime, candidate.endTime, other.startTime, other.endTime)) {
      continue;
    }
    if (candidate.teacherIds.some((id) => other.teacherIds.includes(id))) conflicts.push({ kind: "teacher", with: other, sameSlot });
    if (candidate.roomId && candidate.roomId === other.roomId) conflicts.push({ kind: "room", with: other, sameSlot });
  }
  return conflicts;
}

export function describeConflict(c: Conflict): string {
  const what = c.kind === "teacher" ? "Giáo viên" : "Phòng";
  return `${what} đã có buổi ${c.with.label} lúc ${hhmm(c.with.startTime)}–${hhmm(c.with.endTime)}${c.sameSlot ? " (cùng ca, cùng khung giờ)" : ""}`;
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
