import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { classes, students, teachers } from "@/db/schema";
import { type Actor, assertAdmin } from "../guard";

export async function adminOverview(actor: Actor) {
  assertAdmin(actor);
  const [[s], [t], [c]] = await Promise.all([
    db.select({ n: count() }).from(students).where(eq(students.status, "active")),
    db.select({ n: count() }).from(teachers).where(eq(teachers.status, "active")),
    db.select({ n: count() }).from(classes).where(eq(classes.status, "open")),
  ]);
  return { activeStudents: s?.n ?? 0, activeTeachers: t?.n ?? 0, openClasses: c?.n ?? 0 };
}
