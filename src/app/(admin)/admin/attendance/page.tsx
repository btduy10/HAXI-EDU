import type { Metadata } from "next";
import { OverdueSessions, TodaySessions } from "@/components/session-lists";
import { todayIso } from "@/lib/format";
import { listOverdueSessions } from "@/server/services/attendance";
import { listSessions } from "@/server/services/sessions";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Điểm danh" };

export default async function AdminAttendancePage() {
  const { actor } = await requireMenu("attendance");
  const today = todayIso();
  const [todaySessions, overdue] = await Promise.all([
    listSessions(actor, { from: today, to: today }),
    listOverdueSessions(actor),
  ]);
  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-lg font-semibold">Điểm danh</h1>
        <p className="text-sm text-muted-foreground">
          Chọn một buổi để điểm danh hoặc mở khóa. Các buổi khác tìm trong Thời khóa biểu.
        </p>
      </div>
      <TodaySessions sessions={todaySessions} hrefOf={(s) => `/admin/attendance/${s.id}`} today={today} />
      <OverdueSessions sessions={overdue} hrefOf={(id) => `/admin/attendance/${id}`} />
    </div>
  );
}
