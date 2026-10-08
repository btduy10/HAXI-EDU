import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { formatMoney } from "@/lib/format";
import { createTeacherRateAction, deleteTeacherRateAction, updateTeacherRateAction } from "@/server/actions/admin";
import { seesAllClasses } from "@/server/guard";
import { listTeachers } from "@/server/services/catalog";
import { listClasses } from "@/server/services/classes";
import { listTeacherRates } from "@/server/services/teacher-rates";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Mức lương giáo viên/nhân viên" };

export default async function TeacherRatesPage() {
  const { actor, role, can } = await requireMenu("timesheet");
  // Người chỉ thấy công của chính mình không xem, không đặt mức lương.
  if (!seesAllClasses(actor)) redirect("/admin/timesheet");
  const [rates, teachers, classes] = await Promise.all([listTeacherRates(actor), listTeachers(actor), listClasses(actor)]);

  const fields: Field[] = [
    {
      name: "teacherId",
      label: "Giáo viên",
      type: "select",
      required: true,
      options: teachers.map((t) => ({ value: t.id, label: `${t.code} – ${t.fullName}` })),
    },
    {
      name: "classId",
      label: "Lớp dạy",
      type: "select",
      required: true,
      options: classes.map((c) => ({ value: c.id, label: `${c.code} – ${c.name}` })),
    },
    { name: "rate", label: "Mức lương (đồng/buổi)", type: "money", required: true, hint: "Thành tiền = số công đã dạy ở lớp này × mức lương." },
  ];

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Link href="/admin/timesheet" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← Chấm công
        </Link>
        <p className="text-sm text-muted-foreground">
          Đặt mức lương mỗi buổi theo từng lớp cho giáo viên, trợ giảng. Chấm công lấy mức lương của đúng giáo viên ở đúng lớp để tính
          thành tiền; công ở lớp chưa đặt mức lương được báo riêng.
        </p>
      </div>
      <CrudSection
        title="Mức lương giáo viên/nhân viên"
        numbered
        columns={["Giáo viên", "Lớp dạy", "Mức lương"]}
        emptyText="Chưa đặt mức lương nào."
        rows={rates.map((r) => ({
          id: r.id,
          label: `${r.teacherName} · ${r.classCode}`,
          cells: [`${r.teacherCode} – ${r.teacherName}`, `${r.classCode} – ${r.className}`, `${formatMoney(r.rate)}/buổi`],
          values: { teacherId: r.teacherId, classId: r.classId, rate: String(r.rate) },
        }))}
        fields={fields}
        createAction={can("edit") ? createTeacherRateAction : undefined}
        updateAction={can("edit") ? updateTeacherRateAction : undefined}
        deleteAction={role === "admin" ? deleteTeacherRateAction : undefined}
      />
    </div>
  );
}
