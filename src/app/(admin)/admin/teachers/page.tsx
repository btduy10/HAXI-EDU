import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { LABELS, toOptions } from "@/lib/format";
import { createTeacherAction, deleteTeacherAction, updateTeacherAction } from "@/server/actions/admin";
import { listTeachers } from "@/server/services/catalog";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Giáo viên" };

const fields: Field[] = [
  { name: "code", label: "Mã GV", required: true },
  { name: "fullName", label: "Họ tên", required: true },
  { name: "phone", label: "Điện thoại" },
  { name: "email", label: "Email" },
  { name: "status", label: "Trạng thái", type: "select", required: true, options: toOptions(LABELS.teacherStatus), defaultValue: "active" },
];

export default async function TeachersPage() {
  const { actor } = await requirePageUser("admin");
  const teachers = await listTeachers(actor);
  return (
    <CrudSection
      title="Giáo viên"
      numbered
      columns={["Họ tên", "Mã GV", "Điện thoại", "Email", "Trạng thái"]}
      rows={teachers.map((t) => ({
        id: t.id,
        cells: [t.fullName, t.code, t.phone ?? "", t.email ?? "", LABELS.teacherStatus[t.status]],
        values: { code: t.code, fullName: t.fullName, phone: t.phone ?? "", email: t.email ?? "", status: t.status },
      }))}
      fields={fields}
      createAction={createTeacherAction}
      updateAction={updateTeacherAction}
      deleteAction={deleteTeacherAction}
    />
  );
}
