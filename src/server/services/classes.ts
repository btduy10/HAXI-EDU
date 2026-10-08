import { and, asc, count, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { attendances, classTeachers, classes, courses, enrollments, rooms, sessions, students, teachers, tuitionReceipts } from "@/db/schema";
import type { classInput, classTeacherInput, classTeacherUpdate, enrollInput, leaveInput } from "@/lib/validation/entities";
import { audit } from "../audit";
import { AppError, notFound, translateDbError } from "../errors";
import { type Actor, allowedClassIds, assertAdmin, assertCan, assertCanAny, assertClassAccess } from "../guard";
import { createRow, deleteRow, updateRow } from "./crud";
import { purgeStudentStarLogs } from "./stars";

const activeCount = sql<number>`(
  select count(*)::int from ${enrollments}
  where ${enrollments.classId} = ${classes.id} and ${enrollments.status} = 'active'
)`;

/** Chỉ các lớp trong phạm vi của người dùng (Admin và phạm vi "Tất cả lớp": mọi lớp). */
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
  createRow(actor, classes, "classes", data, "classes");
export async function updateClass(actor: Actor, id: string, data: z.output<typeof classInput>) {
  assertCan(actor, "classes", "edit");
  await assertClassAccess(actor, id);
  return updateRow(actor, classes, "classes", id, data, "classes");
}

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

// Phân công/bỏ phân công giáo viên là một phần của "Sửa lớp".
export async function assignTeacher(actor: Actor, data: z.output<typeof classTeacherInput>) {
  assertCan(actor, "classes", "edit");
  await assertClassAccess(actor, data.classId);
  return createRow(actor, classTeachers, "class_teachers", data, "classes", "edit");
}
export async function updateClassTeacher(actor: Actor, data: z.output<typeof classTeacherUpdate>) {
  assertCan(actor, "classes", "edit");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(classTeachers).where(eq(classTeachers.id, data.id)).limit(1);
    if (!before) throw notFound("phân công");
    await assertClassAccess(actor, before.classId, tx);
    const [row] = await tx
      .update(classTeachers)
      .set({ role: data.role })
      .where(eq(classTeachers.id, data.id))
      .returning();
    await audit(tx, { userId: actor.userId, action: "update", tableName: "class_teachers", recordId: data.id, oldValue: before, newValue: row });
    return row!;
  });
}
export async function unassignTeacher(actor: Actor, id: string) {
  assertCan(actor, "classes", "edit");
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(classTeachers).where(eq(classTeachers.id, id)).limit(1);
    if (!before) throw notFound();
    await assertClassAccess(actor, before.classId, tx);
    await tx.delete(classTeachers).where(eq(classTeachers.id, id));
    await audit(tx, { userId: actor.userId, action: "delete", tableName: "class_teachers", recordId: id, oldValue: before });
  });
}

/** Toàn bộ lịch sử ghi danh của lớp. */
export async function listEnrollments(actor: Actor, classId: string) {
  assertCanAny(actor, ["enrollments", "view"], ["classes", "view"]);
  await assertClassAccess(actor, classId);
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
    // Theo mã học viên; cùng một em ghi danh nhiều lần thì lần mới nhất đứng trước.
    .orderBy(asc(students.code), desc(enrollments.joinedAt));
}

export async function enrollStudent(actor: Actor, data: z.output<typeof enrollInput>) {
  assertCan(actor, "enrollments", "add");
  await assertClassAccess(actor, data.classId);
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
  assertCan(actor, "enrollments", "edit");
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(enrollments).where(eq(enrollments.id, data.id)).limit(1);
    if (!before) throw notFound("ghi danh");
    await assertClassAccess(actor, before.classId, tx);
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

/**
 * Xóa hẳn một dòng ghi danh nhập sai (chỉ Admin), kèm điểm danh và lịch sử sao của học viên ở các buổi
 * của lớp trong thời gian ghi danh đó; cấp và avatar của học viên được tính lại.
 */
export async function deleteEnrollment(actor: Actor, id: string) {
  assertAdmin(actor);
  return db.transaction(async (tx) => {
    const [before] = await tx.select().from(enrollments).where(eq(enrollments.id, id)).limit(1);
    if (!before) throw notFound("ghi danh");
    const [cls] = await tx.select({ status: classes.status }).from(classes).where(eq(classes.id, before.classId)).limit(1);
    if (cls?.status !== "open") throw new AppError("CONFLICT", "Lớp đã đóng và đã chốt tổng kết nên không xóa ghi danh được.");
    const [receipt] = await tx.select({ id: tuitionReceipts.id }).from(tuitionReceipts).where(eq(tuitionReceipts.enrollmentId, id)).limit(1);
    if (receipt) throw new AppError("CONFLICT", "Lượt ghi danh này đã có phiếu thu học phí nên không xóa được.");

    const inPeriod = await tx
      .select({ id: sessions.id })
      .from(sessions)
      .where(
        and(
          eq(sessions.classId, before.classId),
          gte(sessions.date, before.joinedAt),
          before.leftAt ? lt(sessions.date, before.leftAt) : undefined,
        ),
      );
    const sessionIds = inPeriod.map((r) => r.id);
    const removed =
      sessionIds.length === 0
        ? []
        : await tx
            .delete(attendances)
            .where(and(eq(attendances.studentId, before.studentId), inArray(attendances.sessionId, sessionIds)))
            .returning({ id: attendances.id });
    const deletedStarLogs = await purgeStudentStarLogs(tx, actor, before.studentId, sessionIds);

    await tx.delete(enrollments).where(eq(enrollments.id, id));
    await audit(tx, {
      userId: actor.userId,
      action: "delete",
      tableName: "enrollments",
      recordId: id,
      oldValue: before,
      newValue: { deletedAttendances: removed.length, deletedStarLogs },
    });
    return { deletedAttendances: removed.length, deletedStarLogs };
  });
}
