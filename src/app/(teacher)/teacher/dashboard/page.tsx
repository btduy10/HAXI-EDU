import type { Metadata } from "next";
import { ClassList } from "@/components/class-list";
import { OverdueSessions, TodaySessions } from "@/components/session-lists";
import { todayIso } from "@/lib/format";
import { listOverdueSessions } from "@/server/services/attendance";
import { listClasses } from "@/server/services/classes";
import { listSessions } from "@/server/services/sessions";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function TeacherDashboardPage() {
  const user = await requirePageUser("teacher");
  const today = todayIso();
  const [todaySessions, overdue, classes] = await Promise.all([
    listSessions(user.actor, { from: today, to: today, personal: true }),
    listOverdueSessions(user.actor),
    listClasses(user.actor),
  ]);
  const attendanceHref = (id: string) => `/teacher/sessions/${id}/attendance`;

  return (
    <div className="grid gap-6">
      <h1 className="text-lg font-semibold">Xin chào, {user.name}</h1>
      <TodaySessions sessions={todaySessions} hrefOf={(s) => attendanceHref(s.id)} today={today} />
      <OverdueSessions sessions={overdue} hrefOf={attendanceHref} />
      <section className="grid gap-2">
        <h2 className="font-medium">Lớp đang dạy</h2>
        <ClassList classes={classes.filter((c) => c.status === "open")} basePath="/teacher/classes" />
      </section>
    </div>
  );
}
