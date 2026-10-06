CREATE TYPE "public"."teacher_role" AS ENUM('teacher', 'duty_teacher');--> statement-breakpoint
ALTER TABLE "teachers" ADD COLUMN "role" "teacher_role" DEFAULT 'teacher' NOT NULL;