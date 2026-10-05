import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { listOverdueSessions } from "@/server/services/attendance";
import { adminOverview } from "@/server/services/dashboard";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Tổng quan" };

export default async function AdminDashboardPage() {
  const user = await requirePageUser("admin");
  const [overview, overdue] = await Promise.all([adminOverview(user.actor), listOverdueSessions(user.actor)]);
  const stats = [
    { label: "Học viên đang học", value: overview.activeStudents, href: "/admin/students" },
    { label: "Giáo viên đang dạy", value: overview.activeTeachers, href: "/admin/teachers" },
    { label: "Lớp đang mở", value: overview.openClasses, href: "/admin/classes" },
    { label: "Buổi quá hạn chưa điểm danh", value: overdue.length, href: "/admin/attendance" },
  ];
  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold">Xin chào, {user.name}</h1>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.href} href={s.href} className="rounded-xl focus-visible:outline-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-normal text-muted-foreground">{s.label}</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold tabular-nums">{s.value}</CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
