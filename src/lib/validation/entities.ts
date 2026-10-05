import { z } from "zod";
import {
  code,
  id,
  intIn,
  isoDate,
  optEmail,
  optId,
  optIntIn,
  optIsoDate,
  optPhone,
  optText,
  reqText,
  timeOfDay,
} from "./common";

export const teacherInput = z.object({
  code,
  fullName: reqText(100),
  phone: optPhone,
  email: optEmail,
  status: z.enum(["active", "inactive"]).default("active"),
});

export const studentInput = z.object({
  code,
  fullName: reqText(100),
  birthDate: optIsoDate,
  gender: z
    .union([z.enum(["male", "female", "other"]), z.literal("")])
    .nullish()
    .transform((v) => (v ? v : null)),
  schoolGrade: optIntIn(1, 12),
  guardianName: optText(100),
  phone: optPhone,
  status: z.enum(["active", "paused", "left"]).default("active"),
  note: optText(500),
});

export const courseInput = z.object({
  name: reqText(100),
  description: optText(500),
  totalSessions: intIn(1, 500),
});

export const roomInput = z.object({
  name: reqText(50),
  capacity: intIn(1, 500),
});

export const timeSlotInput = z
  .object({
    name: reqText(50),
    defaultStart: timeOfDay,
    defaultEnd: timeOfDay,
  })
  .refine((v) => v.defaultStart < v.defaultEnd, { path: ["defaultEnd"], message: "Giờ kết thúc phải sau giờ bắt đầu" });

export const holidayInput = z.object({
  date: isoDate,
  reason: reqText(200),
  classId: optId,
});

export const classInput = z
  .object({
    code,
    name: reqText(100),
    courseId: id,
    defaultRoomId: optId,
    startDate: isoDate,
    endDate: isoDate,
    maxSize: intIn(1, 200),
  })
  .refine((v) => v.startDate <= v.endDate, { path: ["endDate"], message: "Ngày kết thúc phải sau ngày bắt đầu" });

export const classTeacherInput = z.object({
  classId: id,
  teacherId: id,
  role: z.enum(["main", "assistant"]).default("main"),
});

export const enrollInput = z.object({
  classId: id,
  studentId: id,
  joinedAt: isoDate,
});

export const leaveInput = z.object({
  id,
  leftAt: isoDate,
});

export const password = z
  .string({ error: "Bắt buộc nhập" })
  .min(10, "Mật khẩu tối thiểu 10 ký tự")
  .max(128, "Mật khẩu tối đa 128 ký tự")
  .refine((v) => /[A-Za-z]/.test(v) && /\d/.test(v), "Mật khẩu phải có cả chữ và số");

export const accountInput = z
  .object({
    username: z
      .string({ error: "Bắt buộc nhập" })
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,32}$/, "3–32 ký tự: chữ thường, số, dấu . _ -"),
    name: reqText(100),
    role: z.enum(["admin", "teacher"]),
    teacherId: optId,
    password,
  })
  .refine((v) => v.role !== "teacher" || v.teacherId, {
    path: ["teacherId"],
    message: "Tài khoản giáo viên phải gắn với một giáo viên",
  });

export const resetPasswordInput = z.object({ id: z.string().min(1), password });
export const userIdInput = z.object({ id: z.string().min(1).max(64) });
export const lockInput = z.object({ id: z.string().min(1).max(64), locked: z.boolean() });

const withId = <T extends z.ZodType>(schema: T) => z.object({ id, data: schema });
export const teacherUpdate = withId(teacherInput);
export const studentUpdate = withId(studentInput);
export const courseUpdate = withId(courseInput);
export const roomUpdate = withId(roomInput);
export const timeSlotUpdate = withId(timeSlotInput);
export const classUpdate = withId(classInput);
