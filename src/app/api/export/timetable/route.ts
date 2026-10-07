import { addDays, daysBetween, parseIsoDate } from "@/lib/dates";
import { todayIso } from "@/lib/format";
import { AppError } from "@/server/errors";
import { handleExport } from "@/server/export-route";
import { can } from "@/server/guard";
import { extraTimetableDoc, timetableDoc } from "@/server/services/reports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Xuất TKB. Ai được xem menu Thời khóa biểu thì lọc theo GV/lớp/phòng; còn lại chỉ nhận lịch cá nhân (service giới hạn phạm vi). */
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
    const personal = !can(actor, "timetable", "view");
    // kind=extra: xuất Lớp học thêm thay cho buổi học của các lớp Robotics.
    if (params.get("kind") === "extra") return extraTimetableDoc(actor, { from, to, teacherId: uuid("teacherId"), roomId: uuid("roomId"), personal });
    return timetableDoc(actor, {
      from,
      to,
      classId: uuid("classId"),
      teacherId: uuid("teacherId"),
      roomId: uuid("roomId"),
      personal,
    });
  });
}