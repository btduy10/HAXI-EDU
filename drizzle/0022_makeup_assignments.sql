CREATE TABLE "makeup_assignments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"absent_session_id" uuid NOT NULL,
	"makeup_session_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "makeup_assignments_distinct_chk" CHECK ("makeup_assignments"."absent_session_id" <> "makeup_assignments"."makeup_session_id")
);
--> statement-breakpoint
ALTER TABLE "makeup_assignments" ADD CONSTRAINT "makeup_assignments_absent_session_id_sessions_id_fk" FOREIGN KEY ("absent_session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "makeup_assignments" ADD CONSTRAINT "makeup_assignments_makeup_session_id_sessions_id_fk" FOREIGN KEY ("makeup_session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "makeup_assignments" ADD CONSTRAINT "makeup_assignments_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "makeup_assignments" ADD CONSTRAINT "makeup_assignments_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "makeup_assignments_absent_uniq" ON "makeup_assignments" USING btree ("absent_session_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "makeup_assignments_makeup_uniq" ON "makeup_assignments" USING btree ("makeup_session_id","student_id");--> statement-breakpoint
CREATE INDEX "makeup_assignments_student_idx" ON "makeup_assignments" USING btree ("student_id");