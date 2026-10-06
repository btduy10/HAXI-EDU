import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const teacherStatus = pgEnum("teacher_status", ["active", "inactive"]);
// Vai trò của giáo viên, quyết định bảng quyền áp dụng cho tài khoản gắn với giáo viên đó (Cấu hình → Phân quyền).
export const teacherRole = pgEnum("teacher_role", ["teacher", "duty_teacher"]);

export const teachers = pgTable("teachers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  status: teacherStatus("status").notNull().default("active"),
  role: teacherRole("role").notNull().default("teacher"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
