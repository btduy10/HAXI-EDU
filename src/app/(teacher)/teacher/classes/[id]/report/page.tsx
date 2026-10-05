import type { Metadata } from "next";
import Link from "next/link";
import { ClassReportCharts, ClassReportTable, ExportLinks } from "@/components/class-report";
import { orNotFound, uuidParam } from "@/server/page";
import { getClassReport } from "@/server/services/summaries";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Báo cáo lớp" };

export default async function TeacherClassReportPage({ params }: PageProps<"/teacher/classes/[id]/report">) {
  const { actor } = await requirePageUser("teacher");
  const classId = uuidParam((await params).id);
  // getClassReport kiểm tra quyền theo lớp; lớp của GV khác trả 404.
  const report = await orNotFound(getClassReport(actor, classId));
  return (
    <div className="grid gap-4">
      <div className="grid gap-1">
        <Link href={`/teacher/classes/${classId}`} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← {report.class.code} – {report.class.name}
        </Link>
        <h1 className="text-lg font-semibold">Báo cáo lớp {report.class.code}</h1>
      </div>
      <ExportLinks baseHref={`/api/export/class-report/${classId}`} />
      <ClassReportCharts rows={report.rows} />
          <ClassReportTable rows={report.rows} sessions={report.sessions} />
    </div>
  );
}