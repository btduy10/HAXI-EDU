CREATE TABLE "syllabus_lessons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"class_id" uuid NOT NULL,
	"subject_code" text NOT NULL,
	"period" integer NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "syllabus_lessons_period_chk" CHECK ("syllabus_lessons"."period" >= 1)
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "teacher_remark" text;--> statement-breakpoint
ALTER TABLE "syllabus_lessons" ADD CONSTRAINT "syllabus_lessons_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "syllabus_lessons_class_subject_period_uq" ON "syllabus_lessons" USING btree ("class_id","subject_code","period");