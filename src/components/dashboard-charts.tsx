import { AttendanceDonut, BarList, ChartCard, ColumnChart } from "@/components/charts";
import { addDays } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import type { DashboardCharts as Data } from "@/server/services/dashboard";

/** Bốn biểu đồ của trang Tổng quan. Phạm vi số liệu (toàn trung tâm hay lớp của GV) do service quyết định. */
export function DashboardCharts({ data, scopeLabel }: { data: Data; scopeLabel: string }) {
  const totalStudents = data.levels.reduce((sum, l) => sum + l.students, 0);
  return (
    <div className="stagger grid grid-cols-1 gap-4 lg:grid-cols-2">
      <ChartCard title="Điểm danh 30 ngày qua" subtitle={`Cơ cấu các lượt điểm danh · ${scopeLabel}`}>
        <AttendanceDonut counts={data.attendance} emptyText="Chưa có buổi nào được điểm danh trong 30 ngày qua." />
      </ChartCard>

      <ChartCard title="Sao ghi nhận theo tuần" subtitle="Tổng sao thưởng trừ sao phạt, 8 tuần gần nhất">
        <ColumnChart
          unit="sao"
          dense
          emptyText="Chưa ghi sao trong 8 tuần gần đây."
          data={data.starsByWeek.map((w) => ({
            key: w.weekStart,
            label: formatDate(w.weekStart).slice(0, 5),
            value: w.stars,
            detail: `Tuần ${formatDate(w.weekStart)} – ${formatDate(addDays(w.weekStart, 6))}`,
          }))}
        />
      </ChartCard>

      <ChartCard title="Chuyên cần theo lớp" subtitle="Tỷ lệ có đi học trên các lượt đã điểm danh, lớp đang mở">
        <BarList
          max={100}
          emptyText="Chưa có lớp nào được điểm danh."
          data={data.classRates.map((c) => ({
            key: c.classId,
            label: `${c.code} – ${c.name}`,
            value: c.rate,
            display: `${c.rate}%`,
            detail: `${c.total} lượt điểm danh`,
          }))}
        />
      </ChartCard>

      <ChartCard title="Học viên theo cấp bậc" subtitle={`${totalStudents} học viên đang học · ${scopeLabel}`}>
        <BarList
          emptyText="Chưa cấu hình cấp bậc."
          data={data.levels.map((l) => ({
            key: String(l.levelNo),
            label: `Cấp ${l.levelNo} · ${l.name}`,
            value: l.students,
            detail: totalStudents > 0 ? `${Math.round((l.students / totalStudents) * 100)}% học viên` : undefined,
          }))}
        />
      </ChartCard>
    </div>
  );
}
