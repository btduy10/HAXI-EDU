ALTER TABLE "class_teachers" ADD COLUMN "rate_per_session" integer;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD COLUMN "assistant_teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "assistant_teacher_id" uuid;--> statement-breakpoint
ALTER TABLE "schedule_templates" ADD CONSTRAINT "schedule_templates_assistant_teacher_id_teachers_id_fk" FOREIGN KEY ("assistant_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_assistant_teacher_id_teachers_id_fk" FOREIGN KEY ("assistant_teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sessions_assistant_date_idx" ON "sessions" USING btree ("assistant_teacher_id","date");