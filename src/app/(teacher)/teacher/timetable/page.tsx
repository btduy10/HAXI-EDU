import type { Metadata } from "next";
import { TimetablePage } from "@/components/timetable-page";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "TKB của tôi" };

export default async function TeacherTimetablePage({ searchParams }: PageProps<"/teacher/timetable">) {
  const { actor } = await requirePageUser("teacher");
  return (
    <TimetablePage
      actor={actor}
      params={await searchParams}
      basePath="/teacher/timetable"
      title="TKB của tôi"
      sessionHref={(s) => `/teacher/sessions/${s.id}/attendance`}
    />
  );
}
