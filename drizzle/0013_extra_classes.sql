CREATE TABLE "extra_classes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"course_id" uuid NOT NULL,
	"room_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"time_slot_id" uuid NOT NULL,
	"teacher_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "extra_classes_weekday_chk" CHECK ("extra_classes"."weekday" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "extra_classes" ADD CONSTRAINT "extra_classes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_classes" ADD CONSTRAINT "extra_classes_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_classes" ADD CONSTRAINT "extra_classes_time_slot_id_time_slots_id_fk" FOREIGN KEY ("time_slot_id") REFERENCES "public"."time_slots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "extra_classes" ADD CONSTRAINT "extra_classes_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "extra_classes_weekday_slot_idx" ON "extra_classes" USING btree ("weekday","time_slot_id");