ALTER TABLE "time_slots" ADD COLUMN "frame" smallint;--> statement-breakpoint
UPDATE "time_slots" t SET "frame" = r.n FROM (SELECT "id", row_number() OVER (PARTITION BY "name" ORDER BY "default_end", "default_start") AS n FROM "time_slots") r WHERE r."id" = t."id";--> statement-breakpoint
ALTER TABLE "time_slots" ALTER COLUMN "frame" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "time_slots_name_frame_no_uq" ON "time_slots" USING btree ("name","frame");--> statement-breakpoint
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_frame_range" CHECK ("time_slots"."frame" between 1 and 10);
