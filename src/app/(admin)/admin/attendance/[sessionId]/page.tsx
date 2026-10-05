import type { Metadata } from "next";
import { AttendancePage } from "@/components/attendance-page";
import { uuidParam } from "@/server/page";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Điểm danh" };

export default async function AdminAttendanceSheetPage({ params }: PageProps<"/admin/attendance/[sessionId]">) {
  const { actor } = await requirePageUser("admin");
  const sessionId = uuidParam((await params).sessionId);
  return <AttendancePage actor={actor} sessionId={sessionId} backHref={`/admin/sessions/${sessionId}`} />;
}
