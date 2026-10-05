import type { Metadata } from "next";
import { TimetablePage } from "@/components/timetable-page";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Thời khóa biểu" };

export default async function AdminTimetablePage({ searchParams }: PageProps<"/admin/timetable">) {
  const { actor } = await requirePageUser("admin");
  return (
    <TimetablePage
      actor={actor}
      params={await searchParams}
      basePath="/admin/timetable"
      title="Thời khóa biểu"
      sessionHref={(s) => `/admin/sessions/${s.id}`}
    />
  );
}
