import type { Metadata } from "next";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ClassReportCharts, ClassReportTable, ExportLinks } from "@/components/class-report";
import { LinkButton } from "@/components/link-button";
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
      <form>
        {/* Chọn lớp là hiện báo cáo ngay. Màn hình rộng: ô chọn chỉ chiếm nửa chiều ngang. */}
        <label className="grid gap-1.5 text-sm font-medium sm:w-1/2">
          Lớp học
          <AutoSubmitSelect name="classId" defaultValue={current?.id ?? ""}>
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} – {c.name} ({LABELS.classStatus[c.status]})
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
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