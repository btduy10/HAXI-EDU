import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { teachers } from "./teachers";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const studentStatus = pgEnum("student_status", ["active", "paused", "left"]);
export const gender = pgEnum("gender", ["male", "female", "other"]);
export const classStatus = pgEnum("class_status", ["open", "closed"]);
export const classTeacherRole = pgEnum("class_teacher_role", ["main", "assistant"]);
export const enrollmentStatus = pgEnum("enrollment_status", ["active", "left"]);
export const sessionKind = pgEnum("session_kind", ["regular", "makeup"]);
export const sessionStatus = pgEnum("session_status", ["planned", "done", "cancelled"]);
export const attendanceStatus = pgEnum("attendance_status", ["present", "excused", "absent", "late", "left_early"]);
export const criteriaType = pgEnum("criteria_type", ["reward", "penalty"]);
export const avatarUnlockType = pgEnum("avatar_unlock_type", ["by_level", "gifted"]);
export const handoverStatus = pgEnum("handover_status", ["pending", "given"]);

export const students = pgTable(
  "students",
  {
    id: id(),
    code: text("code").notNull().unique(),
    fullName: text("full_name").notNull(),
    birthDate: date("birth_date"),
    gender: gender("gender"),
    schoolGrade: smallint("school_grade"),
    guardianName: text("guardian_name"),
    phone: text("phone"),
    status: studentStatus("status").notNull().default("active"),
    currentAvatarId: uuid("current_avatar_id").references((): AnyPgColumn => avatars.id, { onDelete: "set null" }),
    note: text("note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("students_name_idx").on(t.fullName)],
);

export const courses = pgTable("courses", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  totalSessions: integer("total_sessions").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const rooms = pgTable("rooms", {
  id: id(),
  name: text("name").notNull().unique(),
  capacity: integer("capacity").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// Ca cố định: chỉ là giờ mặc định, buổi học sao chép giờ từ đây lúc sinh.
export const timeSlots = pgTable("time_slots", {
  id: id(),
  name: text("name").notNull().unique(),
  defaultStart: time("default_start").notNull(),
  defaultEnd: time("default_end").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const classes = pgTable(
  "classes",
  {
    id: id(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    courseId: uuid("course_id")
      .notNull()
      .references(() => courses.id),
    defaultRoomId: uuid("default_room_id").references(() => rooms.id),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    maxSize: integer("max_size").notNull(),
    status: classStatus("status").notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("classes_course_idx").on(t.courseId)],
);

// class_id null = nghỉ toàn trung tâm
export const holidays = pgTable(
  "holidays",
  {
    id: id(),
    date: date("date").notNull(),
    reason: text("reason").notNull(),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [index("holidays_date_idx").on(t.date)],
);

export const classTeachers = pgTable(
  "class_teachers",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    teacherId: uuid("teacher_id")
      .notNull()
      .references(() => teachers.id),
    role: classTeacherRole("role").notNull().default("main"),
    /** Lương mỗi buổi (đồng) của GV ở lớp này; null = chưa nhập. Chấm công dùng để tính thành tiền. */
    ratePerSession: integer("rate_per_session"),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("class_teachers_uniq").on(t.classId, t.teacherId),
    index("class_teachers_teacher_idx").on(t.teacherId),
  ],
);

export const enrollments = pgTable(
  "enrollments",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    joinedAt: date("joined_at").notNull(),
    leftAt: date("left_at"),
    status: enrollmentStatus("status").notNull().default("active"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("enrollments_class_student_idx").on(t.classId, t.studentId),
    index("enrollments_student_idx").on(t.studentId),
    // Một học viên chỉ có một ghi danh đang hiệu lực trong mỗi lớp.
    uniqueIndex("enrollments_active_uniq").on(t.classId, t.studentId).where(sql`${t.status} = 'active'`),
  ],
);

// Một lớp có nhiều dòng lịch mẫu mỗi tuần. weekday: 1 = Thứ Hai ... 7 = Chủ nhật (ISO).
export const scheduleTemplates = pgTable(
  "schedule_templates",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    weekday: smallint("weekday").notNull(),
    timeSlotId: uuid("time_slot_id")
      .notNull()
      .references(() => timeSlots.id),
    roomId: uuid("room_id").references(() => rooms.id),
    teacherId: uuid("teacher_id").references(() => teachers.id),
    assistantTeacherId: uuid("assistant_teacher_id").references(() => teachers.id),
    startTime: time("start_time"),
    endTime: time("end_time"),
    createdAt: createdAt(),
  },
  (t) => [
    index("schedule_templates_class_idx").on(t.classId),
    check("schedule_templates_weekday_chk", sql`${t.weekday} between 1 and 7`),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").references(() => scheduleTemplates.id, { onDelete: "set null" }),
    date: date("date").notNull(),
    originalDate: date("original_date"),
    timeSlotId: uuid("time_slot_id").references(() => timeSlots.id),
    // Sao chép từ ca lúc sinh buổi, chỉnh riêng được từng buổi.
    startTime: time("start_time").notNull(),
    endTime: time("end_time").notNull(),
    roomId: uuid("room_id").references(() => rooms.id),
    teacherId: uuid("teacher_id").references(() => teachers.id),
    substituteTeacherId: uuid("substitute_teacher_id").references(() => teachers.id),
    assistantTeacherId: uuid("assistant_teacher_id").references(() => teachers.id),
    kind: sessionKind("kind").notNull().default("regular"),
    status: sessionStatus("status").notNull().default("planned"),
    content: text("content"),
    note: text("note"),
    attendanceUnlockedUntil: timestamp("attendance_unlocked_until", { withTimezone: true }),
    attendanceUnlockedBy: text("attendance_unlocked_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("sessions_date_idx").on(t.date),
    index("sessions_class_date_idx").on(t.classId, t.date),
    index("sessions_teacher_date_idx").on(t.teacherId, t.date),
    index("sessions_substitute_date_idx").on(t.substituteTeacherId, t.date),
    index("sessions_assistant_date_idx").on(t.assistantTeacherId, t.date),
    index("sessions_room_date_idx").on(t.roomId, t.date),
    // Sinh buổi lặp lại không tạo trùng. Buổi đã dời giữ original_date nên dùng ngày gốc.
    uniqueIndex("sessions_template_origin_uniq").on(t.templateId, sql`coalesce(${t.originalDate}, ${t.date})`),
    check("sessions_time_chk", sql`${t.startTime} < ${t.endTime}`),
  ],
);

// Buổi bù chỉ gồm học viên được chọn.
export const sessionStudents = pgTable(
  "session_students",
  {
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
  },
  (t) => [uniqueIndex("session_students_uniq").on(t.sessionId, t.studentId)],
);

export const attendances = pgTable(
  "attendances",
  {
    id: id(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    status: attendanceStatus("status").notNull().default("present"),
    note: text("note"),
    recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("attendances_session_student_uniq").on(t.sessionId, t.studentId),
    index("attendances_student_idx").on(t.studentId),
  ],
);

export const starCriteria = pgTable("star_criteria", {
  id: id(),
  name: text("name").notNull(),
  stars: integer("stars").notNull(),
  type: criteriaType("type").notNull(),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

// Sổ cái: chỉ thêm. Hoàn tác = thêm bản ghi đảo dấu trỏ về bản gốc qua reverses_log_id.
export const starLogs = pgTable(
  "star_logs",
  {
    id: id(),
    sessionId: uuid("session_id").references(() => sessions.id),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    criteriaId: uuid("criteria_id").references(() => starCriteria.id),
    stars: integer("stars").notNull(),
    note: text("note"),
    reversesLogId: uuid("reverses_log_id").references((): AnyPgColumn => starLogs.id),
    recordedBy: text("recorded_by").references(() => user.id, { onDelete: "set null" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("star_logs_student_idx").on(t.studentId),
    index("star_logs_session_student_idx").on(t.sessionId, t.studentId),
    uniqueIndex("star_logs_reverses_uniq").on(t.reversesLogId),
  ],
);

export const levels = pgTable("levels", {
  id: id(),
  levelNo: integer("level_no").notNull().unique(),
  name: text("name").notNull(),
  minStars: integer("min_stars").notNull(),
  frameColor: text("frame_color").notNull(),
});

export const avatars = pgTable("avatars", {
  id: id(),
  name: text("name").notNull(),
  svgPath: text("svg_path").notNull().unique(),
  requiredLevelId: uuid("required_level_id").references(() => levels.id),
  unlockType: avatarUnlockType("unlock_type").notNull().default("by_level"),
  active: boolean("active").notNull().default(true),
});

// Avatar Admin tặng riêng: không mất khi tụt cấp.
export const studentAvatarGifts = pgTable(
  "student_avatar_gifts",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    avatarId: uuid("avatar_id")
      .notNull()
      .references(() => avatars.id),
    giftedBy: text("gifted_by").references(() => user.id, { onDelete: "set null" }),
    giftedAt: timestamp("gifted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("student_avatar_gifts_uniq").on(t.studentId, t.avatarId)],
);

export const gifts = pgTable("gifts", {
  id: id(),
  name: text("name").notNull(),
  description: text("description"),
  stock: integer("stock").notNull().default(0),
});

export const rewardTiers = pgTable(
  "reward_tiers",
  {
    id: id(),
    courseId: uuid("course_id").references(() => courses.id, { onDelete: "cascade" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "cascade" }),
    minStars: integer("min_stars").notNull(),
    giftId: uuid("gift_id")
      .notNull()
      .references(() => gifts.id),
  },
  (t) => [check("reward_tiers_scope_chk", sql`(${t.courseId} is null) <> (${t.classId} is null)`)],
);

export const courseSummaries = pgTable(
  "course_summaries",
  {
    id: id(),
    classId: uuid("class_id")
      .notNull()
      .references(() => classes.id, { onDelete: "cascade" }),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id),
    totalStars: integer("total_stars").notNull(),
    attendanceRate: numeric("attendance_rate", { precision: 5, scale: 2 }).notNull(),
    rank: integer("rank").notNull(),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("course_summaries_uniq").on(t.classId, t.studentId)],
);

export const giftHandovers = pgTable(
  "gift_handovers",
  {
    id: id(),
    summaryId: uuid("summary_id")
      .notNull()
      .references(() => courseSummaries.id, { onDelete: "cascade" }),
    giftId: uuid("gift_id")
      .notNull()
      .references(() => gifts.id),
    status: handoverStatus("status").notNull().default("pending"),
    givenAt: timestamp("given_at", { withTimezone: true }),
    givenBy: text("given_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [uniqueIndex("gift_handovers_summary_uniq").on(t.summaryId)],
);

// Đổi quà trong khóa học: mỗi dòng là một lần đổi, `stars` là số sao đã dùng (chụp từ mốc quà lúc đổi).
// Sao còn lại của học viên = tổng sao tích lũy − tổng `stars` ở bảng này; tổng tích lũy và cấp bậc không đổi.
export const giftRedemptions = pgTable(
  "gift_redemptions",
  {
    id: id(),
    studentId: uuid("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    classId: uuid("class_id").references(() => classes.id, { onDelete: "set null" }),
    giftId: uuid("gift_id")
      .notNull()
      .references(() => gifts.id),
    stars: integer("stars").notNull(),
    redeemedBy: text("redeemed_by").references(() => user.id, { onDelete: "set null" }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("gift_redemptions_student_idx").on(t.studentId), check("gift_redemptions_stars_chk", sql`${t.stars} > 0`)],
);
