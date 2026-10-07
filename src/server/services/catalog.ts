import { and, asc, desc, eq, ne } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { classes, courses, holidays, rooms, teachers, timeSlots, user } from "@/db/schema";
import type { courseInput, holidayInput, roomInput, teacherInput, timeSlotInput } from "@/lib/validation/entities";
import { audit } from "../audit";
import { AppError } from "../errors";
import { type Actor, assertCan, assertSignedIn, can, isAdmin } from "../guard";
import { assertKnownRole } from "../settings";
import { createRow, deleteRow, updateRow } from "./crud";

// Danh mục dùng chung: giáo viên, khóa học, phòng, ca học, ngày nghỉ.
// Đọc: mọi người dùng đã đăng nhập (dữ liệu tham chiếu cho các ô chọn, không có thông tin học viên).
// Thêm/sửa: Admin hoặc vai trò được tick ở menu tương ứng. Xóa: chỉ Admin.

/** Ai không có quyền xem menu Giáo viên chỉ nhận mã, tên, trạng thái (đủ cho ô chọn), không có điện thoại, email. */
export async function listTeachers(actor: Actor) {
  const rows = await db.select().from(teachers).orderBy(asc(teachers.code));
  return can(actor, "teachers", "view") ? rows : rows.map((t) => ({ ...t, phone: null, email: null }));
}
// Cột Vai trò (Giáo viên / Giáo viên trực) quyết định quyền của tài khoản gắn kèm, nên chỉ Admin đặt được:
// người khác thêm giáo viên thì luôn là "Giáo viên", sửa thì giữ nguyên vai trò đang có.
export async function createTeacher(actor: Actor, data: z.output<typeof teacherInput>) {
  if (isAdmin(actor)) await assertKnownRole(data.role);
  return createRow(actor, teachers, "teachers", isAdmin(actor) ? data : { ...data, role: "teacher" }, "teachers");
}

export async function updateTeacher(actor: Actor, id: string, data: z.output<typeof teacherInput>) {
  if (!isAdmin(actor)) {
    const patch: Partial<typeof data> = { ...data };
    delete patch.role;
    return updateRow(actor, teachers, "teachers", id, patch, "teachers");
  }
  await assertKnownRole(data.role);
  const row = await updateRow(actor, teachers, "teachers", id, data, "teachers");
  // Tài khoản (không phải Quản trị) gắn với giáo viên này nhận vai trò mới ngay ở yêu cầu kế tiếp.
  const synced = await db
    .update(user)
    .set({ role: row.role, updatedAt: new Date() })
    .where(and(eq(user.teacherId, id), ne(user.role, "admin"), ne(user.role, row.role)))
    .returning({ id: user.id });
  for (const account of synced) {
    await audit(db, { userId: actor.userId, action: "account_role_synced", tableName: "user", recordId: account.id, newValue: { role: row.role, teacherId: id } });
  }
  return row;
}
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
/** Một ca không có hai khung cùng số (vd. hai "Khung 2" của Ca chiều). */
async function assertFrameFree(data: z.output<typeof timeSlotInput>, exceptId?: string) {
  const conditions = [eq(timeSlots.name, data.name), eq(timeSlots.frame, data.frame)];
  if (exceptId) conditions.push(ne(timeSlots.id, exceptId));
  const [taken] = await db.select({ id: timeSlots.id }).from(timeSlots).where(and(...conditions)).limit(1);
  if (taken) {
    const message = `${data.name} đã có Khung ${data.frame}. Hãy chọn khung khác.`;
    throw new AppError("VALIDATION", message, { frame: message });
  }
}
export async function createTimeSlot(actor: Actor, data: z.output<typeof timeSlotInput>) {
  assertCan(actor, "rooms", "add");
  await assertFrameFree(data);
  return createRow(actor, timeSlots, "time_slots", data, "rooms");
}
// Sửa ca chỉ đổi giờ mặc định cho các buổi sinh SAU này; buổi đã sinh giữ giờ riêng.
export async function updateTimeSlot(actor: Actor, id: string, data: z.output<typeof timeSlotInput>) {
  assertCan(actor, "rooms", "edit");
  await assertFrameFree(data, id);
  return updateRow(actor, timeSlots, "time_slots", id, data, "rooms");
}
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
