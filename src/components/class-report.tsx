import { StarIcon } from "lucide-react";
import { AttendanceDonut, BarList, ChartCard } from "@/components/charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

type Row = {
  studentId: string;
  code: string;
  fullName: string;
  totalStars: number;
  rank: number;
  attendance: { present: number; late: number; left_early: number; excused: number; absent: number; taught: number; rate: number };
};

export function ExportLinks({ baseHref, label = "Xuất" }: { baseHref: string; label?: string }) {
  const join = baseHref.includes("?") ? "&" : "?";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted-foreground">{label}:</span>
      {(["xlsx", "pdf"] as const).map((format) => (
        // Tải tệp: dùng thẻ <a> thường để trình duyệt tự tải về, không qua router.
        <a
          key={format}
          href={`${baseHref}${join}format=${format}`}
          download
          className="inline-flex h-10 items-center rounded-lg border px-3 font-medium hover:bg-muted"
        >
          {format === "xlsx" ? "Excel" : "PDF"}
        </a>
      ))}
    </div>
  );
}

/** Biểu đồ của báo cáo lớp: cơ cấu điểm danh (tròn), sao và chuyên cần theo học viên (cột ngang). */
export function ClassReportCharts({ rows }: { rows: Row[] }) {
  const counts = { present: 0, late: 0, left_early: 0, excused: 0, absent: 0 };
  for (const r of rows) {
    counts.present += r.attendance.present;
    counts.late += r.attendance.late;
    counts.left_early += r.attendance.left_early;
    counts.excused += r.attendance.excused;
    counts.absent += r.attendance.absent;
  }
  const byStars = [...rows].sort((a, b) => b.totalStars - a.totalStars);
  const byRate = [...rows].sort((a, b) => b.attendance.rate - a.attendance.rate);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <ChartCard title="Cơ cấu điểm danh của lớp" subtitle="Tất cả lượt điểm danh ở các buổi đã dạy" className="lg:col-span-2">
        <AttendanceDonut counts={counts} emptyText="Lớp chưa có buổi nào được điểm danh." />
      </ChartCard>
      <ChartCard title="Sao của lớp theo học viên" subtitle="Tổng sao ghi trong các buổi của lớp này">
        <BarList
          emptyText="Lớp chưa có học viên."
          data={byStars.map((r) => ({ key: r.studentId, label: r.fullName, value: r.totalStars, detail: `${r.code} · hạng ${r.rank}` }))}
        />
      </ChartCard>
      <ChartCard title="Chuyên cần theo học viên" subtitle="Tỷ lệ có đi học trên số buổi đã dạy">
        <BarList
          max={100}
          emptyText="Lớp chưa có học viên."
          data={byRate.map((r) => ({
            key: r.studentId,
            label: r.fullName,
            value: r.attendance.rate,
            display: `${r.attendance.rate}%`,
            detail: `${r.code} · ${r.attendance.taught} buổi`,
          }))}
        />
      </ChartCard>
    </div>
  );
}

const rateClass = (rate: number) => (rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-red-600");

/** Báo cáo lớp: sao của lớp, chuyên cần trên số buổi đã dạy, xếp hạng. Di động dạng thẻ, màn hình rộng dạng bảng. */
export function ClassReportTable({ rows, sessions }: { rows: Row[]; sessions: { done: number; cancelled: number; planned: number } }) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Đã dạy {sessions.done} buổi · hủy {sessions.cancelled} buổi · còn {sessions.planned} buổi chưa dạy. Chuyên cần tính trên buổi đã dạy,
        không kể buổi hủy.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Lớp chưa có học viên.</p>
      ) : (
        <>
          <ul className="grid gap-2 md:hidden">
            {rows.map((r) => (
              <li key={r.studentId} className="grid gap-1 rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <p className="min-w-0 font-medium break-words">
                    <span className="text-muted-foreground">#{r.rank}</span> {r.fullName}{" "}
                    <span className="font-normal text-muted-foreground">{r.code}</span>
                  </p>
                  <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold tabular-nums text-amber-600">
                    <StarIcon className="size-3.5 fill-current" aria-hidden />
                    {r.totalStars}
                  </span>
                </div>
                <p className="text-muted-foreground">
                  Chuyên cần <span className={cn("font-semibold", rateClass(r.attendance.rate))}>{r.attendance.rate}%</span> ({r.attendance.taught}{" "}
                  buổi) · có mặt {r.attendance.present} · trễ {r.attendance.late} · về sớm {r.attendance.left_early} · phép {r.attendance.excused} · vắng{" "}
                  {r.attendance.absent}
                </p>
              </li>
            ))}
          </ul>
          <div className="hidden rounded-lg border md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  {["Hạng", "Học viên", "Sao của lớp", "Có mặt", "Đi trễ", "Về sớm", "Vắng phép", "Vắng KP", "Số buổi", "Chuyên cần"].map((h) => (
                    <TableHead key={h}>{h}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.studentId}>
                    <TableCell className="tabular-nums">{r.rank}</TableCell>
                    <TableCell>
                      {r.fullName} <span className="text-muted-foreground">{r.code}</span>
                    </TableCell>
                    <TableCell className="font-semibold tabular-nums text-amber-600">{r.totalStars}</TableCell>
                    <TableCell className="tabular-nums">{r.attendance.present}</TableCell>
                    <TableCell className="tabular-nums">{r.attendance.late}</TableCell>
                    <TableCell className="tabular-nums">{r.attendance.left_early}</TableCell>
                    <TableCell className="tabular-nums">{r.attendance.excused}</TableCell>
                    <TableCell className="tabular-nums">{r.attendance.absent}</TableCell>
                    <TableCell className="tabular-nums">{r.attendance.taught}</TableCell>
                    <TableCell className={cn("font-semibold tabular-nums", rateClass(r.attendance.rate))}>{r.attendance.rate}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
