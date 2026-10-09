import type { Metadata } from "next";
import { ClassList } from "@/components/class-list";
import { listClasses } from "@/server/services/classes";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Lớp của tôi" };

export default async function TeacherClassesPage() {
  const { actor } = await requirePageUser("teacher");
  const classes = await listClasses(actor);
  return (
    <div className="grid gap-4">
      <h1 className="text-xl font-semibold sm:text-2xl">Lớp của tôi</h1>
      <ClassList classes={classes} basePath="/teacher/classes" />
    </div>
  );
}
