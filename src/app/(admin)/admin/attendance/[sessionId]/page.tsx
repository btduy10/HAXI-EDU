import type { Metadata } from "next";
import { AttendancePage } from "@/components/attendance-page";
import { uuidParam } from "@/server/page";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Điểm danh" };

export default async function AdminAttendanceSheetPage({ params }: PageProps<"/admin/attendance/[sessionId]">) {
  const { actor, can } = await requireMenu("attendance");
  const sessionId = uuidParam((await params).sessionId);
  return <AttendancePage actor={actor} sessionId={sessionId} area="admin" backHref={can("view", "timetable") ? `/admin/sessions/${sessionId}` : "/admin/attendance"} />;
}
