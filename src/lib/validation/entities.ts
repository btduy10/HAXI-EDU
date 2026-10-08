import { z } from "zod";
import { ROLE_KEY } from "@/lib/permissions";
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

/** Ca học cố định: Admin chọn, không nhập tên. */
export const SLOT_NAMES = ["Ca sáng", "Ca chiều", "Ca tối"] as const;
export const SLOT_NAME_LABELS: Record<(typeof SLOT_NAMES)[number], string> = { "Ca sáng": "Sáng", "Ca chiều": "Chiều", "Ca tối": "Tối" };
/** Số khung giờ tối đa của một ca (Khung 1 … Khung 10). */
export const MAX_SLOT_FRAMES = 10;

// Mã lớp, mã giáo viên là văn bản tự do (vd. "RB - S7"), chỉ gộp khoảng trắng thừa; không ép chữ hoa hay bộ ký tự.
const freeCode = reqText(30).transform((v) => v.replace(/\s+/g, " "));

export const teacherInput = z.object({
  code: freeCode,
  fullName: reqText(100),
  phone: optPhone,
  email: optEmail,
  status: z.enum(["active", "inactive"]).default("active"),
  // Khóa của một vai trò trong Cấu hình → Phân quyền; service kiểm tra vai trò có tồn tại.
  role: z.string().regex(ROLE_KEY, "Vai trò không hợp lệ").default("teacher"),
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
    name: z.enum(SLOT_NAMES, { error: "Chọn Sáng, Chiều hoặc Tối" }),
    frame: intIn(1, MAX_SLOT_FRAMES),
    defaultStart: timeOfDay,
    defaultEnd: timeOfDay,
  })
  .refine((v) => v.defaultStart < v.defaultEnd, { path: ["defaultEnd"], message: "Giờ kết thúc phải sau giờ bắt đầu" });

/** Lớp học thêm: lớp ngoài hệ thống, giữ phòng hằng tuần theo Thứ + Ca + Khung giờ. */
export const extraClassInput = z.object({
  name: reqText(100),
  courseId: id,
  roomId: id,
  weekday: intIn(1, 7),
  timeSlotId: id,
  teacherId: optId,
});

/** Một bài trong Syllabus của lớp. */
export const syllabusInput = z.object({
  classId: id,
  subjectCode: reqText(30).transform((v) => v.replace(/\s+/g, " ")),
  period: intIn(1, 999),
  title: reqText(200),
});

export const TIMESHEET_ROLES = ["main", "substitute", "assistant"] as const;
/** Công bổ sung: dòng công ghi tay của giáo viên ở bảng Chấm công. */
export const timesheetEntryInput = z.object({
  teacherId: id,
  date: isoDate,
  timeSlotId: id,
  classId: id,
  role: z.enum(TIMESHEET_ROLES, { error: "Chọn vai trò" }).default("main"),
  note: optText(300),
});
export const timesheetEntryUpdate = timesheetEntryInput.extend({ id });
/** Sửa dòng công sinh từ buổi học (chỉ đổi trên bảng công). `timeSlotId` trống = giữ giờ của buổi. */
export const timesheetAdjustInput = z.object({
  sessionId: id,
  part: z.enum(["lead", "assistant"]),
  date: isoDate,
  timeSlotId: optId,
  classId: id,
  note: optText(300),
});

export const holidayInput = z.object({
  date: isoDate,
  reason: reqText(200),
  classId: optId,
});

export const classInput = z
  .object({
    code: freeCode,
    name: reqText(100),
    courseId: id,
    defaultRoomId: optId,
    startDate: isoDate,
    endDate: isoDate,
    maxSize: intIn(1, 200),
  })
  .refine((v) => v.startDate <= v.endDate, { path: ["endDate"], message: "Ngày kết thúc phải sau ngày bắt đầu" });

/** Lương mỗi buổi (đồng) của GV ở lớp; để trống = chưa nhập. */
const ratePerSession = optIntIn(0, 100_000_000);

export const classTeacherInput = z.object({
  classId: id,
  teacherId: id,
  role: z.enum(["main", "assistant"]).default("main"),
  ratePerSession,
});

/** Sửa phân công: đổi vai trò (Dạy chính / Trợ giảng) và lương mỗi buổi. */
export const classTeacherUpdate = z.object({
  id,
  role: z.enum(["main", "assistant"]),
  ratePerSession,
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
  .min(8, "Mật khẩu tối thiểu 8 ký tự")
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
    role: z.string({ error: "Bắt buộc chọn" }).regex(ROLE_KEY, "Vai trò không hợp lệ"),
    teacherId: optId,
    password,
  })
  .refine((v) => v.role !== "teacher" || v.teacherId, {
    path: ["teacherId"],
    message: "Tài khoản giáo viên phải gắn với một giáo viên",
  });

/** Sửa tài khoản: không đổi mật khẩu ở đây (dùng "Đặt lại mật khẩu"). */
export const accountEditInput = z
  .object({
    id: z.string().min(1).max(64),
    username: z
      .string({ error: "Bắt buộc nhập" })
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9._-]{3,32}$/, "3–32 ký tự: chữ thường, số, dấu . _ -"),
    name: reqText(100),
    role: z.string({ error: "Bắt buộc chọn" }).regex(ROLE_KEY, "Vai trò không hợp lệ"),
    teacherId: optId,
  })
  .refine((v) => v.role !== "teacher" || v.teacherId, {
    path: ["teacherId"],
    message: "Tài khoản giáo viên phải gắn với một giáo viên",
  });
export const resetPasswordInput = z.object({
  id: z.string().min(1).max(64),
  password,
  /** true = mật khẩu tạm, người dùng phải đổi ở lần đăng nhập sau; false = dùng luôn mật khẩu này. */
  mustChange: z
    .union([z.boolean(), z.enum(["true", "false"])])
    .default(true)
    .transform((v) => v === true || v === "true"),
});
export const userIdInput = z.object({ id: z.string().min(1).max(64) });
export const lockInput = z.object({ id: z.string().min(1).max(64), locked: z.boolean() });

const withId = <T extends z.ZodType>(schema: T) => z.object({ id, data: schema });
export const teacherUpdate = withId(teacherInput);
export const studentUpdate = withId(studentInput);
export const courseUpdate = withId(courseInput);
export const roomUpdate = withId(roomInput);
export const timeSlotUpdate = withId(timeSlotInput);
export const extraClassUpdate = withId(extraClassInput);
export const syllabusUpdate = withId(syllabusInput);
export const classUpdate = withId(classInput);
