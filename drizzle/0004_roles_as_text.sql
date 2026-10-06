ALTER TABLE "teachers" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "teachers" ALTER COLUMN "role" SET DEFAULT 'teacher';--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DATA TYPE text;--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'teacher';--> statement-breakpoint
DROP TYPE "public"."teacher_role";--> statement-breakpoint
DROP TYPE "public"."user_role";