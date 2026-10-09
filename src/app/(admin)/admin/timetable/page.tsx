import type { Metadata } from "next";
import { TimetablePage } from "@/components/timetable-page";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Thời khóa biểu" };

export default async function AdminTimetablePage({ searchParams }: PageProps<"/admin/timetable">) {
  const { actor, role, can } = await requireMenu("timetable");
  return (
    <TimetablePage
      actor={actor}
      params={await searchParams}
      manage
      canAdd={can("add")}
      canEdit={can("edit")}
      canDelete={role === "admin"}
      basePath="/admin/timetable"
      title="Thời khóa biểu"
      sessionHref={(s) => `/admin/sessions/${s.id}`}
    />
  );
}
