import { and, asc, count, desc, eq, inArray, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { classTeachers, classes, courses, enrollments, rooms, sessions, students, teachers } from "@/db/schema";
import type { classInput, classTeacherInput, enrollInput, leaveInput } from "@/lib/validation/entities";
import { audit } from "../audit";
import { AppError, notFound, translateDbError } from "../errors";
import { type Actor, allowedClassIds, assertAdmin, assertClassAccess } from "../guard";
import { createRow, deleteRow, updateRow } from "./crud";

const activeCount = sql<number>`(
  select count(*)::int from ${enrollments}
  where ${enrollments.classId} = ${classes.id} and ${enrollments.status} = 'active'
)`;

/** Admin thấy mọi lớp; GV chỉ thấy lớp được phân công. */
export async function listClasses(actor: Actor) {
  const allowed = await allowedClassIds(actor);
  if (allowed && allowed.length === 0) return [];
  return db
    .select({
      id: classes.id,
      code: classes.code,
      name: classes.name,
      courseId: classes.courseId,
      courseName: courses.name,
      defaultRoomId: classes.defaultRoomId,
      roomName: rooms.name,
      startDate: classes.startDate,
      endDate: classes.endDate,
      maxSize: classes.maxSize,
      status: classes.status,
      studentCount: activeCount,
    })
    .from(classes)
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .leftJoin(rooms, eq(rooms.id, classes.defaultRoomId))
    .where(allowed ? inArray(classes.id, allowed) : undefined)
    .orderBy(desc(classes.startDate), asc(classes.code));
}

export async function getClass(actor: Actor, classId: string) {
  await assertClassAccess(actor, classId);
  const [row] = await db
    .select({
      id: classes.id,
      code: classes.code,
      name: classes.name,
      courseId: classes.courseId,
      courseName: courses.name,
      defaultRoomId: classes.defaultRoomId,
      roomName: rooms.name,
      startDate: classes.startDate,
      endDate: classes.endDate,
      maxSize: classes.maxSize,
      status: classes.status,
    })
    .from(classes)
    .innerJoin(courses, eq(courses.id, classes.courseId))
    .leftJoin(rooms, eq(rooms.id, classes.defaultRoomId))
    .where(eq(classes.id, classId))
    .limit(1);
  if (!row) throw notFound("lớp học");
  return row;
}

export const createClass = (actor: Actor, data: z.output<typeof classInput>) =>
  createRow(actor, classes, "classes", data);
export const updateClass = (actor: Actor, id: string, data: z.output<typeof classInput>) =>
  updateRow(actor, classes, "classes", id, data);

export async function deleteClass(actor: Actor, id: string) {
  assertAdmin(actor);
  const [used] = await db.select({ n: count() }).from(sessions).where(eq(sessions.classId, id));
  if (used && used.n > 0) throw new AppError("CONFLICT", "Lớp đã có buổi học nên không thể xóa.");
  return deleteRow(actor, classes, "classes", id);
}

export async function listClassTeachers(actor: Actor, classId: string) {
  await assertClassAccess(actor, classId);
  return db
    .select({
      id: classTeachers.id,
      teacherId: teachers.id,
      code: teachers.code,
      fullName: teachers.fullName,
      role: classTeachers.role,
    })
    .from(classTeachers)
    .innerJoin(teachers, eq(teachers.id, classTeachers.teacherId))
    .where(eq(classTeachers.classId, classId))
    .orderBy(asc(classTeachers.role), asc(teachers.fullName));
}

export const assignTeacher = (actor: Actor, data: z.output<typeof classTeacherInput>) =>
  createRow(actor, classTeachers, "class_teachers", data);
export const unassignTeacher = (actor: Actor, id: string) => deleteRow(actor, classTeachers, "class_teachers", id);

/** Toàn bộ lịch sử ghi danh của lớp (Admin). */
export async function listEnrollments(actor: Actor, classId: string) {
  assertAdmin(actor);
  return db
    .select({
      id: enrollments.id,
      studentId: students.id,
      code: students.code,
      fullName: students.fullName,
      joinedAt: enrollments.joinedAt,
      leftAt: enrollments.leftAt,
      status: enrollments.status,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(eq(enrollments.classId, classId))
    .orderBy(asc(enrollments.status), asc(students.fullName));
}

export async function enrollStudent(actor: Actor, data: z.output<typeof enrollInput>) {
  assertAdmin(actor);
  try {
    return await db.transaction(async (tx) => {
      // Khóa dòng lớp để hai thao tác ghi danh đồng thời không vượt sĩ số.
      const [cls] = await tx.select().from(classes).where(eq(classes.id, data.classId)).for("update").limit(1);
      if (!cls) throw notFound("lớp học");
      if (cls.status !== "open") throw new AppError("CONFLICT", "Lớp đã đóng, không thể ghi danh.");
      const [student] = await tx.select().from(students).where(eq(students.id, data.studentId)).limit(1);
      if (!student) throw notFound("học viên");
      if (student.status === "left") throw new AppError("CONFLICT", "Học viên đã nghỉ hẳn, không thể ghi danh.");
      const [current] = await tx
        .select({ n: count() })
        .from(enrollments)
        .where(and(eq(enrollments.classId, data.classId), eq(enrollments.status, "active")));
      if ((current?.n ?? 0) >= cls.maxSize) {
        throw new AppError("CONFLICT", `Lớp đã đủ sĩ số tối đa (${cls.maxSize}).`);
      }
      const [row] = await tx.insert(enrollments).values({ ...data, status: "active" }).returning();
      await audit(tx, { userId: actor.userId, action: "create", tableName: "enrollments", recordId: row!.id, newValue: row });
      return row!;
    });
  } catch (e) {
    const err = translateDbError(e);
    if (err instanceof AppError && err.code === "CONFLICT" && err.message.startsWith("Dữ liệu bị trùng")) {
      throw new AppError("CONFLICT", "Học viên đã ghi danh lớp này.");
    }
    throw err;
  }
}

/** Cho học viên rời lớp từ ngày `leftAt` (giữ lịch sử, không xóa). */
export async function leaveEnrollment(actor: Actor, data: z.output<typeof leaveInput>) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(enrollments).where(eq(enrollments.id, data.id)).limit(1);
    if (!before) throw notFound("ghi danh");
    if (before.status !== "active") throw new AppError("CONFLICT", "Ghi danh này đã kết thúc.");
    if (data.leftAt < before.joinedAt) {
      throw new AppError("VALIDATION", "Ngày rời lớp phải sau ngày vào lớp.", { leftAt: "Phải sau ngày vào lớp" });
    }
    const [row] = await tx
      .update(enrollments)
      .set({ leftAt: data.leftAt, status: "left", updatedAt: new Date() })
      .where(eq(enrollments.id, data.id))
      .returning();
    await audit(tx, {
      userId: actor.userId,
      action: "update",
      tableName: "enrollments",
      recordId: data.id,
      oldValue: before,
      newValue: row,
    });
    return row!;
  });
}
