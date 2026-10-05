import type { Metadata } from "next";
import { ClassList } from "@/components/class-list";
import { listClasses } from "@/server/services/classes";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function TeacherDashboardPage() {
  const user = await requirePageUser("teacher");
  const classes = (await listClasses(user.actor)).filter((c) => c.status === "open");
  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold">Xin chào, {user.name}</h1>
      <section className="grid gap-2">
        <h2 className="font-medium">Lớp đang dạy</h2>
        <ClassList classes={classes} basePath="/teacher/classes" />
      </section>
    </div>
  );
}
