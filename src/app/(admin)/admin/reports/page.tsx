import type { Metadata } from "next";
import { ClassReportCharts, ClassReportTable, ExportLinks } from "@/components/class-report";
import { selectClass } from "@/components/form-dialog";
import { LinkButton } from "@/components/link-button";
import { Button } from "@/components/ui/button";
import { LABELS } from "@/lib/format";
import { listClasses } from "@/server/services/classes";
import { getClassReport } from "@/server/services/summaries";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Báo cáo" };

export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const { actor, can } = await requireMenu("reports");
  const classes = await listClasses(actor);
  const raw = (await searchParams).classId;
  const current = classes.find((c) => c.id === (Array.isArray(raw) ? raw[0] : raw)) ?? null;
  const report = current ? await getClassReport(actor, current.id) : null;

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold">Báo cáo lớp</h1>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5 text-sm font-medium">
          Lớp học
          <select name="classId" defaultValue={current?.id ?? ""} className={selectClass}>
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} – {c.name} ({LABELS.classStatus[c.status]})
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" className="h-11">
          Xem
        </Button>
      </form>
      {current && report && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <ExportLinks baseHref={`/api/export/class-report/${current.id}`} />
            {can("view", "rewards") && (
              <LinkButton variant="outline" className="h-10" href={`/admin/rewards?tab=summary&classId=${current.id}`}>
                Tổng kết & quà tặng
              </LinkButton>
            )}
          </div>
          <ClassReportCharts rows={report.rows} />
          <ClassReportTable rows={report.rows} sessions={report.sessions} />
        </section>
      )}
    </div>
  );
}