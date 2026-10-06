CREATE TABLE "gift_redemptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"class_id" uuid,
	"gift_id" uuid NOT NULL,
	"stars" integer NOT NULL,
	"redeemed_by" text,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gift_redemptions_stars_chk" CHECK ("gift_redemptions"."stars" > 0)
);
--> statement-breakpoint
ALTER TABLE "gift_redemptions" ADD CONSTRAINT "gift_redemptions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_redemptions" ADD CONSTRAINT "gift_redemptions_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_redemptions" ADD CONSTRAINT "gift_redemptions_gift_id_gifts_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_redemptions" ADD CONSTRAINT "gift_redemptions_redeemed_by_user_id_fk" FOREIGN KEY ("redeemed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_redemptions_student_idx" ON "gift_redemptions" USING btree ("student_id");