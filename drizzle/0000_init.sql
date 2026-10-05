CREATE TYPE "public"."teacher_status" AS ENUM('active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('admin', 'teacher');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('present', 'excused', 'absent', 'late', 'left_early');--> statement-breakpoint
CREATE TYPE "public"."avatar_unlock_type" AS ENUM('by_level', 'gifted');--> statement-breakpoint
CREATE TYPE "public"."class_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TYPE "public"."class_teacher_role" AS ENUM('main', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."criteria_type" AS ENUM('reward', 'penalty');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('active', 'left');--> statement-breakpoint
CREATE TYPE "public"."gender" AS ENUM('male', 'female', 'other');--> statement-breakpoint
CREATE TYPE "public"."handover_status" AS ENUM('pending', 'given');--> statement-breakpoint
CREATE TYPE "public"."session_kind" AS ENUM('regular', 'makeup');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('planned', 'done', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."student_status" AS ENUM('active', 'paused', 'left');--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"email" text,
	"status" "teacher_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teachers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text,
	"old_value" jsonb,
	"new_value" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "two_factor" (
	"id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"backup_codes" text NOT NULL,
	"user_id" text NOT NULL,
	"verified" boolean DEFAULT true,
	"failed_verification_count" integer DEFAULT 0,
	"locked_until" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"username" text NOT NULL,
	"display_username" text,
	"two_factor_enabled" boolean DEFAULT false NOT NULL,
	"role" "user_role" DEFAULT 'teacher' NOT NULL,
	"teacher_id" uuid,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"locked_until" timestamp with time zone,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"status" "attendance_status" DEFAULT 'present' NOT NULL,
	"note" text,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "avatars" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"svg_path" text NOT NULL,
	"required_level_id" uuid,
	"unlock_type" "avatar_unlock_type" DEFAULT 'by_level' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "avatars_svg_path_unique" UNIQUE("svg_path")
);
--> statement-breakpoint
CREATE TABLE "class_teachers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"teacher_id" uuid NOT NULL,
	"role" "class_teacher_role" DEFAULT 'main' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"course_id" uuid NOT NULL,
	"default_room_id" uuid,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"max_size" integer NOT NULL,
	"status" "class_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "course_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"total_stars" integer NOT NULL,
	"attendance_rate" numeric(5, 2) NOT NULL,
	"rank" integer NOT NULL,
	"finalized_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "courses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"total_sessions" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"joined_at" date NOT NULL,
	"left_at" date,
	"status" "enrollment_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_handovers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"summary_id" uuid NOT NULL,
	"gift_id" uuid NOT NULL,
	"status" "handover_status" DEFAULT 'pending' NOT NULL,
	"given_at" timestamp with time zone,
	"given_by" text
);
--> statement-breakpoint
CREATE TABLE "gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"stock" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"reason" text NOT NULL,
	"class_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "levels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level_no" integer NOT NULL,
	"name" text NOT NULL,
	"min_stars" integer NOT NULL,
	"frame_color" text NOT NULL,
	CONSTRAINT "levels_level_no_unique" UNIQUE("level_no")
);
--> statement-breakpoint
CREATE TABLE "reward_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid,
	"class_id" uuid,
	"min_stars" integer NOT NULL,
	"gift_id" uuid NOT NULL,
	CONSTRAINT "reward_tiers_scope_chk" CHECK (("reward_tiers"."course_id" is null) <> ("reward_tiers"."class_id" is null))
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"capacity" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rooms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "schedule_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"room_id" uuid,
	"teacher_id" uuid,
	"start_time" time,
	"end_time" time,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_templates_weekday_chk" CHECK ("schedule_templates"."weekday" between 1 and 7)
);
--> statement-breakpoint
CREATE TABLE "session_students" (
	"session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"template_id" uuid,
	"date" date NOT NULL,
	"original_date" date,
	"time_slot_id" uuid,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"room_id" uuid,
	"teacher_id" uuid,
	"substitute_teacher_id" uuid,
	"kind" "session_kind" DEFAULT 'regular' NOT NULL,
	"status" "session_status" DEFAULT 'planned' NOT NULL,
	"content" text,
	"note" text,
	"attendance_unlocked_until" timestamp with time zone,
	"attendance_unlocked_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_time_chk" CHECK ("sessions"."start_time" < "sessions"."end_time")
);
--> statement-breakpoint
CREATE TABLE "star_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"stars" integer NOT NULL,
	"type" "criteria_type" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "star_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"student_id" uuid NOT NULL,
	"criteria_id" uuid,
	"stars" integer NOT NULL,
	"note" text,
	"reverses_log_id" uuid,
	"recorded_by" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_avatar_gifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"avatar_id" uuid NOT NULL,
	"gifted_by" text,
	"gifted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"birth_date" date,
	"gender" "gender",
	"school_grade" smallint,
	"guardian_name" text,
	"phone" text,
	"status" "student_status" DEFAULT 'active' NOT NULL,
	"current_avatar_id" uuid,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "time_slots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_start" time NOT NULL,
	"default_end" time NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_slots_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor" ADD CONSTRAINT "two_factor_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "avatars" ADD CONSTRAINT "avatars_required_level_id_levels_id_fk" FOREIGN KEY ("required_level_id") REFERENCES "public"."levels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_teachers" ADD CONSTRAINT "class_teachers_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_default_room_id_rooms_id_fk" FOREIGN KEY ("default_room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_summaries" ADD CONSTRAINT "course_summaries_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "course_summaries" ADD CONSTRAINT "course_summaries_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "enrollments" ADD CONSTRAINT "enrollments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_handovers" ADD CONSTRAINT "gift_handovers_summary_id_course_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."course_summaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_handovers" ADD CONSTRAINT "gift_handovers_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_handovers" ADD CONSTRAINT "gift_handovers_given_by_user_id_fk" FOREIGN KEY ("given_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_tiers" ADD CONSTRAINT "reward_tiers_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_tiers" ADD CONSTRAINT "reward_tiers_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reward_tiers" ADD CONSTRAINT "reward_tiers_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_students" ADD CONSTRAINT "session_students_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_students" ADD CONSTRAINT "session_students_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_template_id_schedule_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."schedule_templates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_substitute_teacher_id_teachers_id_fk" FOREIGN KEY ("substitute_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_attendance_unlocked_by_user_id_fk" FOREIGN KEY ("attendance_unlocked_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_logs" ADD CONSTRAINT "star_logs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_logs" ADD CONSTRAINT "star_logs_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_logs" ADD CONSTRAINT "star_logs_criteria_id_star_criteria_id_fk" FOREIGN KEY ("criteria_id") REFERENCES "public"."star_criteria"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_logs" ADD CONSTRAINT "star_logs_reverses_log_id_star_logs_id_fk" FOREIGN KEY ("reverses_log_id") REFERENCES "public"."star_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "star_logs" ADD CONSTRAINT "star_logs_recorded_by_user_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_avatar_gifts" ADD CONSTRAINT "student_avatar_gifts_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_avatar_gifts" ADD CONSTRAINT "student_avatar_gifts_avatar_id_avatars_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."avatars"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_avatar_gifts" ADD CONSTRAINT "student_avatar_gifts_gifted_by_user_id_fk" FOREIGN KEY ("gifted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_current_avatar_id_avatars_id_fk" FOREIGN KEY ("current_avatar_id") REFERENCES "public"."avatars"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_created_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "audit_record_idx" ON "audit_logs" USING btree ("table_name","record_id");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_user_idx" ON "two_factor" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "two_factor_secret_idx" ON "two_factor" USING btree ("secret");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "attendances_session_student_uniq" ON "attendances" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "attendances_student_idx" ON "attendances" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "class_teachers_uniq" ON "class_teachers" USING btree ("class_id","teacher_id");--> statement-breakpoint
CREATE INDEX "class_teachers_teacher_idx" ON "class_teachers" USING btree ("teacher_id");--> statement-breakpoint
CREATE INDEX "classes_course_idx" ON "classes" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "course_summaries_uniq" ON "course_summaries" USING btree ("class_id","student_id");--> statement-breakpoint
CREATE INDEX "enrollments_class_student_idx" ON "enrollments" USING btree ("class_id","student_id");--> statement-breakpoint
CREATE INDEX "enrollments_student_idx" ON "enrollments" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "enrollments_active_uniq" ON "enrollments" USING btree ("class_id","student_id") WHERE "enrollments"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "gift_handovers_summary_uniq" ON "gift_handovers" USING btree ("summary_id");--> statement-breakpoint
CREATE INDEX "holidays_date_idx" ON "holidays" USING btree ("date");--> statement-breakpoint
CREATE INDEX "schedule_templates_class_idx" ON "schedule_templates" USING btree ("class_id");--> statement-breakpoint
CREATE UNIQUE INDEX "session_students_uniq" ON "session_students" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "sessions_date_idx" ON "sessions" USING btree ("date");--> statement-breakpoint
CREATE INDEX "sessions_class_date_idx" ON "sessions" USING btree ("class_id","date");--> statement-breakpoint
CREATE INDEX "sessions_teacher_date_idx" ON "sessions" USING btree ("teacher_id","date");--> statement-breakpoint
CREATE INDEX "sessions_substitute_date_idx" ON "sessions" USING btree ("substitute_teacher_id","date");--> statement-breakpoint
CREATE INDEX "sessions_room_date_idx" ON "sessions" USING btree ("room_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_template_origin_uniq" ON "sessions" USING btree ("template_id",coalesce("original_date", "date"));--> statement-breakpoint
CREATE INDEX "star_logs_student_idx" ON "star_logs" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "star_logs_session_student_idx" ON "star_logs" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "star_logs_reverses_uniq" ON "star_logs" USING btree ("reverses_log_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_avatar_gifts_uniq" ON "student_avatar_gifts" USING btree ("student_id","avatar_id");--> statement-breakpoint
CREATE INDEX "students_name_idx" ON "students" USING btree ("full_name");