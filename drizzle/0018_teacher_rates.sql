CREATE TABLE "teacher_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"teacher_id" uuid NOT NULL,
	"class_id" uuid NOT NULL,
	"rate" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "teacher_rates_rate_chk" CHECK ("teacher_rates"."rate" >= 0)
);
--> statement-breakpoint
ALTER TABLE "teacher_rates" ADD CONSTRAINT "teacher_rates_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_rates" ADD CONSTRAINT "teacher_rates_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_rates_teacher_class_uq" ON "teacher_rates" USING btree ("teacher_id","class_id");--> statement-breakpoint
-- Chuyển lương/buổi đã nhập ở Lớp học → Giáo viên phụ trách sang bảng mức lương trước khi bỏ cột.
INSERT INTO "teacher_rates" ("teacher_id", "class_id", "rate")
SELECT "teacher_id", "class_id", "rate_per_session" FROM "class_teachers" WHERE "rate_per_session" IS NOT NULL AND "rate_per_session" >= 0;--> statement-breakpoint
ALTER TABLE "class_teachers" DROP COLUMN "rate_per_session";