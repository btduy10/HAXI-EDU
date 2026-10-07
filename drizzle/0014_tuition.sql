CREATE TYPE "public"."payment_method" AS ENUM('cash', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('active', 'cancelled');--> statement-breakpoint
CREATE TABLE "tuition_receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"receipt_no" integer GENERATED ALWAYS AS IDENTITY (sequence name "tuition_receipts_receipt_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"enrollment_id" uuid NOT NULL,
	"amount" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"paid_at" date NOT NULL,
	"payer_name" text,
	"note" text,
	"collected_by" text,
	"status" "receipt_status" DEFAULT 'active' NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tuition_receipts_receipt_no_unique" UNIQUE("receipt_no"),
	CONSTRAINT "tuition_receipts_amount_chk" CHECK ("tuition_receipts"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "classes" ADD COLUMN "tuition_fee" integer;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "fee_discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "enrollments" ADD COLUMN "fee_discount_reason" text;--> statement-breakpoint
ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_enrollment_id_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_collected_by_user_id_fk" FOREIGN KEY ("collected_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tuition_receipts" ADD CONSTRAINT "tuition_receipts_cancelled_by_user_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tuition_receipts_enrollment_idx" ON "tuition_receipts" USING btree ("enrollment_id");