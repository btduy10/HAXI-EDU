CREATE TABLE "purchases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"purchased_at" date NOT NULL,
	"item" text NOT NULL,
	"category" text NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" integer NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchases_quantity_chk" CHECK ("purchases"."quantity" >= 1),
	CONSTRAINT "purchases_unit_price_chk" CHECK ("purchases"."unit_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchases_date_idx" ON "purchases" USING btree ("purchased_at");--> statement-breakpoint
-- Menu Báo cáo đổi từ "báo cáo lớp" sang số liệu tài chính (doanh thu, chi, lãi): đặt lại quyền Báo cáo
-- của mọi vai trò hiện có về "không" để Admin tick lại có chủ ý.
UPDATE "app_settings" SET "value" = (
	SELECT COALESCE(
		jsonb_object_agg(
			e.key,
			CASE
				WHEN jsonb_typeof(e.value -> 'menus') = 'object'
					THEN jsonb_set(e.value, '{menus,reports}', '{"view": false, "add": false, "edit": false}'::jsonb, true)
				ELSE e.value
			END
		),
		'{}'::jsonb
	)
	FROM jsonb_each("app_settings"."value") AS e
)
WHERE "key" = 'role_permissions' AND jsonb_typeof("value") = 'object';
