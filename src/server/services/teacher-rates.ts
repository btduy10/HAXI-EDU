import { and, asc, eq, ne } from "drizzle-orm";
import type { z } from "zod";
import { db } from "@/db";
import { classes, teacherRates, teachers } from "@/db/schema";
import type { teacherRateInput } from "@/lib/validation/entities";
import { AppError, forbidden } from "../errors";
import { type Actor, assertCan, seesAllClasses } from "../guard";
import { createRow, deleteRow, updateRow } from "./crud";

// Mức lương mỗi buổi (công) của giáo viên/trợ giảng theo từng lớp; Chấm công dùng để tính thành tiền.
// Lương là thông tin nhạy cảm: phải thấy được công của mọi người (phạm vi "Tất cả lớp") mới xem/đặt được,
// nên người chỉ thấy công của chính mình không tự đặt lương cho mình.

function assertAllScope(actor: Actor) {
  if (!seesAllClasses(actor)) throw forbidden();
}

export async function listTeacherRates(actor: Actor) {
  assertCan(actor, "timesheet", "view");
  assertAllScope(actor);
  return db
    .select({
      id: teacherRates.id,
      teacherId: teacherRates.teacherId,
      teacherCode: teachers.code,
      teacherName: teachers.fullName,
      classId: teacherRates.classId,
      classCode: classes.code,
      className: classes.name,
      rate: teacherRates.rate,
    })
    .from(teacherRates)
    .innerJoin(teachers, eq(teachers.id, teacherRates.teacherId))
    .innerJoin(classes, eq(classes.id, teacherRates.classId))
    .orderBy(asc(teachers.code), asc(classes.code));
}

/** Mỗi giáo viên chỉ có một mức lương ở một lớp. */
async function assertNoDuplicate(data: z.output<typeof teacherRateInput>, exceptId?: string) {
  const conditions = [eq(teacherRates.teacherId, data.teacherId), eq(teacherRates.classId, data.classId)];
  if (exceptId) conditions.push(ne(teacherRates.id, exceptId));
  const [existing] = await db.select({ id: teacherRates.id }).from(teacherRates).where(and(...conditions)).limit(1);
  if (existing) {
    throw new AppError("VALIDATION", "Giáo viên này đã có mức lương ở lớp đó.", { classId: "Giáo viên này đã có mức lương ở lớp đó." });
  }
}

export async function createTeacherRate(actor: Actor, data: z.output<typeof teacherRateInput>) {
  assertCan(actor, "timesheet", "edit");
  assertAllScope(actor);
  await assertNoDuplicate(data);
  return createRow(actor, teacherRates, "teacher_rates", data, "timesheet", "edit");
}

export async function updateTeacherRate(actor: Actor, id: string, data: z.output<typeof teacherRateInput>) {
  assertCan(actor, "timesheet", "edit");
  assertAllScope(actor);
  await assertNoDuplicate(data, id);
  return updateRow(actor, teacherRates, "teacher_rates", id, data, "timesheet");
}

export const deleteTeacherRate = (actor: Actor, id: string) => deleteRow(actor, teacherRates, "teacher_rates", id);
