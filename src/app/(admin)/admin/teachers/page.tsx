import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { LABELS, toOptions } from "@/lib/format";
import { createTeacherAction, deleteTeacherAction, updateTeacherAction } from "@/server/actions/admin";
import { listTeachers } from "@/server/services/catalog";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Giáo viên" };

const fields: Field[] = [
  { name: "code", label: "Mã GV", required: true },
  { name: "fullName", label: "Họ tên", required: true },
  { name: "shortName", label: "Tên viết tắt", hint: "Hiển thị trên Thời khóa biểu cho gọn; để trống thì dùng họ tên." },
  { name: "phone", label: "Điện thoại" },
  { name: "email", label: "Email" },
  { name: "status", label: "Trạng thái", type: "select", required: true, options: toOptions(LABELS.teacherStatus), defaultValue: "active" },
];

export default async function TeachersPage() {
  const { actor, role, can } = await requireMenu("teachers");
  const teachers = await listTeachers(actor);
  return (
    <CrudSection
      title="Giáo viên"
      numbered
      columns={["Mã GV", "Họ tên", "Tên viết tắt", "Điện thoại", "Email", "Trạng thái"]}
      rows={teachers.map((t) => ({
        id: t.id,
        label: t.fullName,
        cells: [t.code, t.fullName, t.shortName ?? "", t.phone ?? "", t.email ?? "", LABELS.teacherStatus[t.status]],
        values: { code: t.code, fullName: t.fullName, shortName: t.shortName ?? "", phone: t.phone ?? "", email: t.email ?? "", status: t.status },
      }))}
      fields={fields}
      createAction={can("add") ? createTeacherAction : undefined}
      updateAction={can("edit") ? updateTeacherAction : undefined}
      deleteAction={role === "admin" ? deleteTeacherAction : undefined}
    />
  );
}
