import type { Metadata } from "next";
import Link from "next/link";
import { DashboardCharts } from "@/components/dashboard-charts";
import { DashboardHero } from "@/components/dashboard-hero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listOverdueSessions } from "@/server/services/attendance";
import { adminOverview, dashboardCharts } from "@/server/services/dashboard";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function AdminDashboardPage() {
  const user = await requirePageUser("admin");
  const [overview, overdue, charts] = await Promise.all([
    adminOverview(user.actor),
    listOverdueSessions(user.actor),
    dashboardCharts(user.actor),
  ]);
  const stats = [
    { label: "Học viên đang học", value: overview.activeStudents, href: "/admin/students" },
    { label: "Giáo viên đang dạy", value: overview.activeTeachers, href: "/admin/teachers" },
    { label: "Lớp đang mở", value: overview.openClasses, href: "/admin/classes" },
    { label: "Buổi quá hạn chưa điểm danh", value: overdue.length, href: "/admin/attendance" },
  ];
  return (
    <div className="grid gap-6">
      <DashboardHero name={user.name} description="Tổng quan hoạt động của trung tâm hôm nay." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-3xl focus-visible:outline-2">
            <Card className="h-full justify-between">
              <CardHeader>
                <CardTitle className="text-sm font-normal text-muted-foreground">{s.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-4xl leading-none font-bold tabular-nums">{s.value}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <DashboardCharts data={charts} scopeLabel="toàn trung tâm" />
    </div>
  );
}
