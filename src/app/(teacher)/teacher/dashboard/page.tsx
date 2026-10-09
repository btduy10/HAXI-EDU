import type { Metadata } from "next";
import { ClassList } from "@/components/class-list";
import { DashboardCharts } from "@/components/dashboard-charts";
import { DashboardHero } from "@/components/dashboard-hero";
import { OverdueSessions, TodaySessions } from "@/components/session-lists";
import { todayIso } from "@/lib/format";
import { seesAllClasses } from "@/server/guard";
import { listOverdueSessions } from "@/server/services/attendance";
import { listClasses } from "@/server/services/classes";
import { dashboardCharts } from "@/server/services/dashboard";
import { listSessions } from "@/server/services/sessions";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function TeacherDashboardPage() {
  const user = await requirePageUser("teacher");
  const today = todayIso();
  // Vai trò được xem mọi lớp (vd. Giáo viên trực) thấy số liệu toàn trung tâm.
  const all = seesAllClasses(user.actor);
  const [todaySessions, overdue, classes, charts] = await Promise.all([
    listSessions(user.actor, { from: today, to: today, personal: true }),
    listOverdueSessions(user.actor),
    listClasses(user.actor),
    dashboardCharts(user.actor),
  ]);
  const attendanceHref = (id: string) => `/teacher/sessions/${id}/attendance`;

  return (
    <div className="grid gap-6">
      <DashboardHero
        name={user.name}
        description={all ? "Tổng quan hoạt động của trung tâm hôm nay." : "Tổng quan các lớp của bạn hôm nay."}
      />
      <TodaySessions sessions={todaySessions} hrefOf={(s) => attendanceHref(s.id)} today={today} />
      <OverdueSessions sessions={overdue} hrefOf={attendanceHref} />
      <DashboardCharts data={charts} scopeLabel={all ? "toàn trung tâm" : "các lớp của tôi"} />
      <section className="grid gap-2">
        <h2 className="font-medium">{all ? "Lớp đang mở" : "Lớp đang dạy"}</h2>
        <ClassList classes={classes.filter((c) => c.status === "open")} basePath="/teacher/classes" />
      </section>
    </div>
  );
}
