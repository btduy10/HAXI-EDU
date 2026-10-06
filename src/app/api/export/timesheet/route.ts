import { daysBetween, endOfMonth, parseIsoDate, startOfMonth } from "@/lib/dates";
import { todayIso } from "@/lib/format";
import { AppError } from "@/server/errors";
import { handleExport } from "@/server/export-route";
import { timesheetDoc } from "@/server/services/timesheet";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Xuất chấm công: tệp tổng hợp mọi giáo viên, hoặc tệp riêng một giáo viên khi có teacherId. Service kiểm tra quyền và phạm vi. */
export async function GET(request: Request) {
  return handleExport(request, "timesheet", null, async (actor) => {
    const params = new URL(request.url).searchParams;
    const today = todayIso();
    const from = parseIsoDate(params.get("from"), startOfMonth(today));
    const to = parseIsoDate(params.get("to"), endOfMonth(today));
    if (to < from || daysBetween(from, to) > 366) throw new AppError("VALIDATION", "Khoảng ngày xuất tối đa 1 năm.");
    const uuid = (key: string) => {
      const value = params.get(key);
      return value && UUID.test(value) ? value : null;
    };
    return timesheetDoc(actor, { from, to, teacherId: uuid("teacherId"), classId: uuid("classId") });
  });
}
