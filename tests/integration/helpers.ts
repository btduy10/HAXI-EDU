import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import * as s from "@/db/schema";
import type { Actor } from "@/server/guard";

export async function resetDb() {
  await db.execute(sql`
    truncate table
      gift_handovers, course_summaries, reward_tiers, gifts, student_avatar_gifts, star_logs, star_criteria,
      attendances, session_students, sessions, schedule_templates, enrollments, class_teachers, holidays,
      classes, time_slots, rooms, courses, students, avatars, levels, audit_logs, app_settings,
      two_factor, verification, account, session, rate_limit, "user", teachers
    restart identity cascade
  `);
}

async function createUser(username: string, role: "admin" | "teacher", teacherId: string | null) {
  const id = randomUUID();
  await db.insert(s.user).values({
    id,
    name: username,
    username,
    email: `${username}@haxi.local`,
    role,
    teacherId,
    mustChangePassword: false,
  });
  return id;
}

/**
 * Bối cảnh chuẩn: 1 admin, GV A dạy lớp A, GV B dạy lớp B, mỗi lớp 2 học viên.
 */
export async function seedFixture() {
  const [teacherA, teacherB] = await db
    .insert(s.teachers)
    .values([
      { code: "GVA", fullName: "Giáo viên A" },
      { code: "GVB", fullName: "Giáo viên B" },
    ])
    .returning();
  const adminId = await createUser("admin", "admin", null);
  const userA = await createUser("gv.a", "teacher", teacherA!.id);
  const userB = await createUser("gv.b", "teacher", teacherB!.id);

  const [course] = await db.insert(s.courses).values({ name: "Robotics", totalSessions: 10 }).returning();
  const [room] = await db.insert(s.rooms).values({ name: "Lab", capacity: 10 }).returning();
  const [classA, classB] = await db
    .insert(s.classes)
    .values([
      { code: "A", name: "Lớp A", courseId: course!.id, defaultRoomId: room!.id, startDate: "2026-01-05", endDate: "2026-03-31", maxSize: 3 },
      { code: "B", name: "Lớp B", courseId: course!.id, defaultRoomId: room!.id, startDate: "2026-01-05", endDate: "2026-03-31", maxSize: 3 },
    ])
    .returning();
  await db.insert(s.classTeachers).values([
    { classId: classA!.id, teacherId: teacherA!.id },
    { classId: classB!.id, teacherId: teacherB!.id },
  ]);

  const students = await db
    .insert(s.students)
    .values(["A1", "A2", "B1", "B2", "X1", "X2"].map((code) => ({ code, fullName: `Học viên ${code}`, phone: "0900000000" })))
    .returning();
  await db.insert(s.enrollments).values([
    { classId: classA!.id, studentId: students[0]!.id, joinedAt: "2026-01-05" },
    { classId: classA!.id, studentId: students[1]!.id, joinedAt: "2026-01-05" },
    { classId: classB!.id, studentId: students[2]!.id, joinedAt: "2026-01-05" },
    { classId: classB!.id, studentId: students[3]!.id, joinedAt: "2026-01-05" },
  ]);

  const admin: Actor = { userId: adminId, role: "admin", teacherId: null };
  const actorA: Actor = { userId: userA, role: "teacher", teacherId: teacherA!.id };
  const actorB: Actor = { userId: userB, role: "teacher", teacherId: teacherB!.id };
  return { admin, actorA, actorB, teacherA: teacherA!, teacherB: teacherB!, classA: classA!, classB: classB!, course: course!, room: room!, students };
}

export type Fixture = Awaited<ReturnType<typeof seedFixture>>;
