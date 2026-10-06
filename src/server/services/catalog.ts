import { asc, desc, eq } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { classes, courses, holidays, rooms, teachers, timeSlots } from "@/db/schema";
import type { courseInput, holidayInput, roomInput, teacherInput, timeSlotInput } from "@/lib/validation/entities";
import { type Actor, assertSignedIn, can } from "../guard";
import { createRow, deleteRow, updateRow } from "./crud";

// Danh mục dùng chung: giáo viên, khóa học, phòng, ca học, ngày nghỉ.
// Đọc: mọi người dùng đã đăng nhập (dữ liệu tham chiếu cho các ô chọn, không có thông tin học viên).
// Thêm/sửa: Admin hoặc vai trò được tick ở menu tương ứng. Xóa: chỉ Admin.

/** Ai không có quyền xem menu Giáo viên chỉ nhận mã, tên, trạng thái (đủ cho ô chọn), không có điện thoại, email. */
export async function listTeachers(actor: Actor) {
  const rows = await db.select().from(teachers).orderBy(asc(teachers.code));
  return can(actor, "teachers", "view") ? rows : rows.map((t) => ({ ...t, phone: null, email: null }));
}
export const createTeacher = (actor: Actor, data: z.output<typeof teacherInput>) =>
  createRow(actor, teachers, "teachers", data, "teachers");
export const updateTeacher = (actor: Actor, id: string, data: z.output<typeof teacherInput>) =>
  updateRow(actor, teachers, "teachers", id, data, "teachers");
export const deleteTeacher = (actor: Actor, id: string) => deleteRow(actor, teachers, "teachers", id);

export async function listCourses(actor: Actor) {
  assertSignedIn(actor);
  return db.select().from(courses).orderBy(asc(courses.name));
}
export const createCourse = (actor: Actor, data: z.output<typeof courseInput>) =>
  createRow(actor, courses, "courses", data, "courses");
export const updateCourse = (actor: Actor, id: string, data: z.output<typeof courseInput>) =>
  updateRow(actor, courses, "courses", id, data, "courses");
export const deleteCourse = (actor: Actor, id: string) => deleteRow(actor, courses, "courses", id);

export async function listRooms(actor: Actor) {
  assertSignedIn(actor);
  return db.select().from(rooms).orderBy(asc(rooms.name));
}
export const createRoom = (actor: Actor, data: z.output<typeof roomInput>) => createRow(actor, rooms, "rooms", data, "rooms");
export const updateRoom = (actor: Actor, id: string, data: z.output<typeof roomInput>) =>
  updateRow(actor, rooms, "rooms", id, data, "rooms");
export const deleteRoom = (actor: Actor, id: string) => deleteRow(actor, rooms, "rooms", id);

export async function listTimeSlots(actor: Actor) {
  assertSignedIn(actor);
  return db.select().from(timeSlots).orderBy(asc(timeSlots.defaultStart));
}
/** Ca học để dựng lưới TKB: mọi người dùng đã đăng nhập đều xem được (không chứa dữ liệu cá nhân). */
export async function listTimeSlotsForGrid() {
  return db
    .select({ id: timeSlots.id, name: timeSlots.name, defaultStart: timeSlots.defaultStart, defaultEnd: timeSlots.defaultEnd })
    .from(timeSlots)
    .orderBy(asc(timeSlots.defaultStart));
}
export const createTimeSlot = (actor: Actor, data: z.output<typeof timeSlotInput>) =>
  createRow(actor, timeSlots, "time_slots", data, "rooms");
// Sửa ca chỉ đổi giờ mặc định cho các buổi sinh SAU này; buổi đã sinh giữ giờ riêng.
export const updateTimeSlot = (actor: Actor, id: string, data: z.output<typeof timeSlotInput>) =>
  updateRow(actor, timeSlots, "time_slots", id, data, "rooms");
export const deleteTimeSlot = (actor: Actor, id: string) => deleteRow(actor, timeSlots, "time_slots", id);

export async function listHolidays(actor: Actor) {
  assertSignedIn(actor);
  return db
    .select({
      id: holidays.id,
      date: holidays.date,
      reason: holidays.reason,
      classId: holidays.classId,
      className: classes.name,
    })
    .from(holidays)
    .leftJoin(classes, eq(classes.id, holidays.classId))
    .orderBy(desc(holidays.date));
}
export const createHoliday = (actor: Actor, data: z.output<typeof holidayInput>) =>
  createRow(actor, holidays, "holidays", data, "rooms");
export const deleteHoliday = (actor: Actor, id: string) => deleteRow(actor, holidays, "holidays", id);
