import { addDays, daysBetween, parseIsoDate } from "@/lib/dates";
import { todayIso } from "@/lib/format";
import { AppError } from "@/server/errors";
import { handleExport } from "@/server/export-route";
import { timetableDoc } from "@/server/services/reports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Xuất TKB. Admin lọc theo GV/lớp/phòng; GV chỉ nhận lịch của mình (service giới hạn phạm vi). */
export async function GET(request: Request) {
  return handleExport(request, "timetable", null, async (actor) => {
    const params = new URL(request.url).searchParams;
    const today = todayIso();
    const from = parseIsoDate(params.get("from"), today);
    const to = parseIsoDate(params.get("to"), addDays(from, 6));
    if (to < from || daysBetween(from, to) > 92) throw new AppError("VALIDATION", "Khoảng ngày xuất tối đa 3 tháng.");
    const uuid = (key: string) => {
      const value = params.get(key);
      return value && UUID.test(value) ? value : null;
    };
    return timetableDoc(actor, {
      from,
      to,
      classId: uuid("classId"),
      teacherId: uuid("teacherId"),
      roomId: uuid("roomId"),
      personal: actor.role !== "admin",
    });
  });
}