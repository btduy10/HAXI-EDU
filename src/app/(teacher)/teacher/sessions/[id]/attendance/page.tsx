import type { Metadata } from "next";
import { AttendancePage } from "@/components/attendance-page";
import { uuidParam } from "@/server/page";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Điểm danh" };

export default async function TeacherAttendancePage({ params }: PageProps<"/teacher/sessions/[id]/attendance">) {
  const { actor } = await requirePageUser("teacher");
  return <AttendancePage actor={actor} sessionId={uuidParam((await params).id)} backHref="/teacher/dashboard" />;
}
