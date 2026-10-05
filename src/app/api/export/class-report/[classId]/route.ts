import { AppError } from "@/server/errors";
import { handleExport } from "@/server/export-route";
import { classReportDoc } from "@/server/services/reports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Xuất báo cáo lớp. GV chỉ xuất được lớp mình (lớp khác trả 404). */
export async function GET(request: Request, { params }: RouteContext<"/api/export/class-report/[classId]">) {
  const { classId } = await params;
  return handleExport(request, "class_report", classId, async (actor) => {
    if (!UUID.test(classId)) throw new AppError("NOT_FOUND", "Không tìm thấy lớp học.");
    return classReportDoc(actor, classId);
  });
}