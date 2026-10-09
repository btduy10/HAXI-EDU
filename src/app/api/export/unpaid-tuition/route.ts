import { handleExport } from "@/server/export-route";
import { unpaidTuitionDoc } from "@/server/services/finance";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Xuất danh sách học viên chưa đóng đủ học phí (cả trung tâm hoặc một lớp). Service kiểm tra quyền Báo cáo. */
export async function GET(request: Request) {
  return handleExport(request, "unpaid_tuition", null, async (actor) => {
    const classId = new URL(request.url).searchParams.get("classId");
    return unpaidTuitionDoc(actor, { classId: classId && UUID.test(classId) ? classId : null });
  });
}
