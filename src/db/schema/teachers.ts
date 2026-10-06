import { pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const teacherStatus = pgEnum("teacher_status", ["active", "inactive"]);

export const teachers = pgTable("teachers", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  email: text("email"),
  status: teacherStatus("status").notNull().default("active"),
  // Khóa vai trò (Cấu hình → Phân quyền): quyết định bảng quyền của tài khoản gắn với giáo viên này.
  role: text("role").notNull().default("teacher"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
