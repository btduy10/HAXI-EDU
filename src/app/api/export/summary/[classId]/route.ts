import { AppError } from "@/server/errors";
import { handleExport } from "@/server/export-route";
import { summaryDoc } from "@/server/services/reports";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Xuất tổng kết cuối khóa: xếp hạng, danh sách trao quà (có cột ký nhận) và số quà cần chuẩn bị. Chỉ Admin. */
export async function GET(request: Request, { params }: RouteContext<"/api/export/summary/[classId]">) {
  const { classId } = await params;
  return handleExport(request, "course_summary", classId, async (actor) => {
    if (!UUID.test(classId)) throw new AppError("NOT_FOUND", "Không tìm thấy lớp học.");
    return summaryDoc(actor, classId);
  });
}