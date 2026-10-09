import { and, asc, eq, ne } from "drizzle-orm";
import type { z } from "zod";
import { db, type DbOrTx } from "@/db";
import { classes, courses, extraClasses, rooms, scheduleTemplates, teachers, timeSlots } from "@/db/schema";
import { WEEKDAY_LABELS, eachDay, isoWeekday } from "@/lib/dates";
import type { extraClassInput } from "@/lib/validation/entities";
import { AppError, forbidden } from "../errors";
import { type Actor, assertCan, assertSignedIn, can } from "../guard";
import { createRow, deleteRow, updateRow } from "./crud";

// Lớp học thêm: lớp ngoài hệ thống, lặp hằng tuần theo Thứ + Ca + Khung giờ, chỉ để biết phòng đang có lớp trên Thời khóa biểu.

type WeeklyPlacement = { weekday: number; timeSlotId: string; roomId: string | null; teacherIds: (string | null)[] };

/**
 * Báo trùng CHỈ khi trùng cả Thứ + Ca + Khung giờ (cùng một dòng ca học): cùng phòng hoặc cùng giáo viên với
 * một lớp học thêm khác, hoặc với lịch mẫu của một lớp chưa đóng. Không so theo giờ chồng lấn.
 */
export async function assertNoWeeklyClash(tx: DbOrTx, place: WeeklyPlacement, opts: { exceptExtraId?: string; extrasOnly?: boolean } = {}) {
  const staff = place.teacherIds.filter((t): t is string => Boolean(t));
  const sameRoom = (roomId: string | null) => place.roomId !== null && roomId === place.roomId;
  const sameStaff = (...ids: (string | null)[]) => ids.some((t) => t !== null && staff.includes(t));
  const clash = (what: string, room: boolean) =>
    new AppError(
      "CONFLICT",
      `Trùng ${room ? "phòng" : "giáo viên"} với ${what} (cùng ${WEEKDAY_LABELS[place.weekday]}, cùng ca và khung giờ).`,
      { timeSlotId: "Trùng lịch" },
    );

  const extras = await tx
    .select({ id: extraClasses.id, name: extraClasses.name, roomId: extraClasses.roomId, teacherId: extraClasses.teacherId })
    .from(extraClasses)
    .where(and(eq(extraClasses.weekday, place.weekday), eq(extraClasses.timeSlotId, place.timeSlotId)));
  for (const e of extras) {
    if (e.id === opts.exceptExtraId) continue;
    if (sameRoom(e.roomId)) throw clash(`lớp học thêm "${e.name}"`, true);
    if (sameStaff(e.teacherId)) throw clash(`lớp học thêm "${e.name}"`, false);
  }

  // Lịch mẫu chỉ được so với lớp học thêm; trùng giữa hai lịch mẫu do phần xếp buổi học tự kiểm tra theo ngày.
  if (opts.extrasOnly) return;
  const templates = await tx
    .select({
      code: classes.code,
      roomId: scheduleTemplates.roomId,
      defaultRoomId: classes.defaultRoomId,
      teacherId: scheduleTemplates.teacherId,
      assistantTeacherId: scheduleTemplates.assistantTeacherId,
    })
    .from(scheduleTemplates)
    .innerJoin(classes, eq(classes.id, scheduleTemplates.classId))
    .where(and(eq(scheduleTemplates.weekday, place.weekday), eq(scheduleTemplates.timeSlotId, place.timeSlotId), ne(classes.status, "closed")));
  for (const t of templates) {
    if (sameRoom(t.roomId ?? t.defaultRoomId)) throw clash(`lịch mẫu của lớp ${t.code}`, true);
    if (sameStaff(t.teacherId, t.assistantTeacherId)) throw clash(`lịch mẫu của lớp ${t.code}`, false);
  }
}

const selection = {
  id: extraClasses.id,
  name: extraClasses.name,
  courseId: extraClasses.courseId,
  courseName: courses.name,
  roomId: extraClasses.roomId,
  roomName: rooms.name,
  weekday: extraClasses.weekday,
  timeSlotId: extraClasses.timeSlotId,
  slotName: timeSlots.name,
  frame: timeSlots.frame,
  startTime: timeSlots.defaultStart,
  endTime: timeSlots.defaultEnd,
  teacherId: extraClasses.teacherId,
  teacherName: teachers.fullName,
  teacherShortName: teachers.shortName,
};
const base = (tx: DbOrTx = db) =>
  tx
    .select(selection)
    .from(extraClasses)
    .innerJoin(courses, eq(courses.id, extraClasses.courseId))
    .innerJoin(rooms, eq(rooms.id, extraClasses.roomId))
    .innerJoin(timeSlots, eq(timeSlots.id, extraClasses.timeSlotId))
    .leftJoin(teachers, eq(teachers.id, extraClasses.teacherId));

export async function listExtraClasses(actor: Actor) {
  if (!can(actor, "classes", "view") && !can(actor, "timetable", "view")) throw forbidden();
  return base().orderBy(asc(extraClasses.weekday), asc(timeSlots.defaultStart), asc(extraClasses.name));
}

const placeOf = (data: z.output<typeof extraClassInput>): WeeklyPlacement => ({
  weekday: data.weekday,
  timeSlotId: data.timeSlotId,
  roomId: data.roomId,
  teacherIds: [data.teacherId],
});

export async function createExtraClass(actor: Actor, data: z.output<typeof extraClassInput>) {
  assertCan(actor, "classes", "add");
  await assertNoWeeklyClash(db, placeOf(data));
  return createRow(actor, extraClasses, "extra_classes", data, "classes");
}

export async function updateExtraClass(actor: Actor, id: string, data: z.output<typeof extraClassInput>) {
  assertCan(actor, "classes", "edit");
  await assertNoWeeklyClash(db, placeOf(data), { exceptExtraId: id });
  return updateRow(actor, extraClasses, "extra_classes", id, data, "classes");
}

export const deleteExtraClass = (actor: Actor, id: string) => deleteRow(actor, extraClasses, "extra_classes", id);

/**
 * Lớp học thêm trải ra từng ngày của khoảng xem trên Thời khóa biểu (mục "ảo", không phải buổi học).
 * TKB riêng (`personal`) chỉ gồm lớp học thêm do chính giáo viên đó dạy.
 */
export async function extraClassesForRange(
  actor: Actor,
  filters: { from: string; to: string; teacherId?: string | null; roomId?: string | null; personal?: boolean },
) {
  assertSignedIn(actor);
  const teacherId = filters.personal ? actor.teacherId : filters.teacherId;
  if (filters.personal && !teacherId) return [];
  const conditions = [];
  if (teacherId) conditions.push(eq(extraClasses.teacherId, teacherId));
  if (filters.roomId) conditions.push(eq(extraClasses.roomId, filters.roomId));
  const rows = await base().where(conditions.length ? and(...conditions) : undefined);
  if (rows.length === 0) return [];
  return [...eachDay(filters.from, filters.to)].flatMap((date) =>
    rows
      .filter((r) => r.weekday === isoWeekday(date))
      .map((r) => ({ ...r, date, key: `extra-${r.id}-${date}` })),
  );
}
