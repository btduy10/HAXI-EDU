DROP INDEX "time_slots_name_frame_uq";--> statement-breakpoint
DROP INDEX "time_slots_name_frame_no_uq";--> statement-breakpoint
ALTER TABLE "time_slots" DROP CONSTRAINT "time_slots_frame_range";--> statement-breakpoint
UPDATE "time_slots" SET "name" = CASE WHEN "default_start" < '12:00' THEN 'Ca sáng' WHEN "default_start" < '17:00' THEN 'Ca chiều' ELSE 'Ca tối' END WHERE "name" NOT IN ('Ca sáng', 'Ca chiều', 'Ca tối');--> statement-breakpoint
UPDATE "time_slots" t SET "frame" = r.n FROM (SELECT "id", row_number() OVER (PARTITION BY "name" ORDER BY "default_end", "default_start", "created_at") AS n FROM "time_slots") r WHERE r."id" = t."id";--> statement-breakpoint
CREATE UNIQUE INDEX "time_slots_name_frame_no_uq" ON "time_slots" USING btree ("name","frame");--> statement-breakpoint
ALTER TABLE "time_slots" ADD CONSTRAINT "time_slots_frame_range" CHECK ("time_slots"."frame" between 1 and 10);
