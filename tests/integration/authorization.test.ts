import { beforeEach, describe, expect, it } from "vitest";
import { assertClassAccess, assertSessionAccess } from "@/server/guard";
import * as accounts from "@/server/services/accounts";
import * as catalog from "@/server/services/catalog";
import * as classes from "@/server/services/classes";
import * as students from "@/server/services/students";
import { db } from "@/db";
import { sessions } from "@/db/schema";
import { type Fixture, resetDb, seedFixture } from "./helpers";

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

describe("phân quyền theo lớp (chống IDOR)", () => {
  it("GV chỉ thấy lớp mình được phân công trong danh sách", async () => {
    const list = await classes.listClasses(f.actorA);
    expect(list.map((c) => c.code)).toEqual(["A"]);
    expect((await classes.listClasses(f.admin)).length).toBe(2);
  });

  it("GV A không đọc được lớp của GV B dù biết id", async () => {
    await expect(classes.getClass(f.actorA, f.classB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(students.listClassStudents(f.actorA, f.classB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(classes.listClassTeachers(f.actorA, f.classB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(assertClassAccess(f.actorA, f.classB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("GV A đọc được lớp mình và chỉ nhận dữ liệu học viên tối thiểu", async () => {
    const cls = await classes.getClass(f.actorA, f.classA.id);
    expect(cls.code).toBe("A");
    const list = await students.listClassStudents(f.actorA, f.classA.id);
    expect(list.map((s) => s.code).sort()).toEqual(["A1", "A2"]);
    expect(Object.keys(list[0]!)).not.toContain("phone");
    expect(Object.keys(list[0]!)).not.toContain("guardianName");
  });

  it("tài khoản GV không gắn giáo viên thì không thấy lớp nào", async () => {
    const orphan = { ...f.actorA, teacherId: null };
    expect(await classes.listClasses(orphan)).toEqual([]);
    await expect(classes.getClass(orphan, f.classA.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("buổi học: GV lớp và GV dạy thay vào được, GV khác thì không", async () => {
    const [own] = await db
      .insert(sessions)
      .values({ classId: f.classB.id, date: "2026-01-06", startTime: "08:00", endTime: "09:30", teacherId: f.teacherB.id })
      .returning();
    const [covered] = await db
      .insert(sessions)
      .values({
        classId: f.classB.id,
        date: "2026-01-08",
        startTime: "08:00",
        endTime: "09:30",
        teacherId: f.teacherB.id,
        substituteTeacherId: f.teacherA.id,
      })
      .returning();
    await expect(assertSessionAccess(f.actorB, own!.id)).resolves.toBeUndefined();
    await expect(assertSessionAccess(f.actorA, own!.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // GV A dạy thay đúng buổi này nên vào được buổi, nhưng vẫn không có quyền trên cả lớp B.
    await expect(assertSessionAccess(f.actorA, covered!.id)).resolves.toBeUndefined();
    await expect(assertClassAccess(f.actorA, f.classB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("chức năng chỉ dành cho Admin", () => {
  it("GV bị từ chối ở mọi service quản trị", async () => {
    const denied = { code: "FORBIDDEN" };
    await expect(catalog.listTeachers(f.actorA)).rejects.toMatchObject(denied);
    await expect(catalog.createRoom(f.actorA, { name: "Phòng lậu", capacity: 5 })).rejects.toMatchObject(denied);
    await expect(catalog.deleteCourse(f.actorA, f.course.id)).rejects.toMatchObject(denied);
    await expect(students.listStudents(f.actorA)).rejects.toMatchObject(denied);
    await expect(students.getStudent(f.actorA, f.students[0]!.id)).rejects.toMatchObject(denied);
    await expect(students.deleteStudent(f.actorA, f.students[0]!.id)).rejects.toMatchObject(denied);
    await expect(classes.listEnrollments(f.actorA, f.classA.id)).rejects.toMatchObject(denied);
    await expect(
      classes.enrollStudent(f.actorA, { classId: f.classA.id, studentId: f.students[4]!.id, joinedAt: "2026-01-10" }),
    ).rejects.toMatchObject(denied);
    await expect(
      classes.assignTeacher(f.actorA, { classId: f.classB.id, teacherId: f.teacherA.id, role: "main" }),
    ).rejects.toMatchObject(denied);
    await expect(classes.deleteClass(f.actorA, f.classA.id)).rejects.toMatchObject(denied);
    await expect(accounts.listAccounts(f.actorA)).rejects.toMatchObject(denied);
    await expect(accounts.resetAccountPassword(f.actorA, f.admin.userId, "MatKhauMoi123")).rejects.toMatchObject(denied);
    await expect(accounts.setAccountLocked(f.actorA, f.actorB.userId, true)).rejects.toMatchObject(denied);
  });

  it("GV không tự phân công mình vào lớp khác được", async () => {
    await expect(
      classes.assignTeacher(f.actorA, { classId: f.classB.id, teacherId: f.teacherA.id, role: "assistant" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(classes.getClass(f.actorA, f.classB.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
