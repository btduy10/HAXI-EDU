import { and, asc, eq, ilike, or } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { enrollments, students } from "@/db/schema";
import type { studentInput } from "@/lib/validation/entities";
import { notFound } from "../errors";
import { type Actor, assertAdmin, assertClassAccess } from "../guard";
import { createRow, deleteRow, updateRow } from "./crud";

export async function listStudents(actor: Actor, search?: string) {
  assertAdmin(actor);
  const term = search?.trim();
  const pattern = term ? `%${term.replace(/[%_\\]/g, "\\$&")}%` : null;
  return db
    .select()
    .from(students)
    .where(pattern ? or(ilike(students.fullName, pattern), ilike(students.code, pattern)) : undefined)
    .orderBy(asc(students.code));
}

export async function getStudent(actor: Actor, id: string) {
  assertAdmin(actor);
  const [row] = await db.select().from(students).where(eq(students.id, id)).limit(1);
  if (!row) throw notFound("học viên");
  return row;
}

export const createStudent = (actor: Actor, data: z.output<typeof studentInput>) =>
  createRow(actor, students, "students", data);
export const updateStudent = (actor: Actor, id: string, data: z.output<typeof studentInput>) =>
  updateRow(actor, students, "students", id, data);
export const deleteStudent = (actor: Actor, id: string) => deleteRow(actor, students, "students", id);

/**
 * Học viên đang ghi danh của một lớp. GV chỉ xem được lớp mình và chỉ nhận
 * các trường tối thiểu (không có số điện thoại, phụ huynh, ghi chú).
 */
export async function listClassStudents(actor: Actor, classId: string) {
  await assertClassAccess(actor, classId);
  return db
    .select({
      id: students.id,
      code: students.code,
      fullName: students.fullName,
      schoolGrade: students.schoolGrade,
      status: students.status,
      joinedAt: enrollments.joinedAt,
    })
    .from(enrollments)
    .innerJoin(students, eq(students.id, enrollments.studentId))
    .where(and(eq(enrollments.classId, classId), eq(enrollments.status, "active")))
    .orderBy(asc(students.fullName));
}
