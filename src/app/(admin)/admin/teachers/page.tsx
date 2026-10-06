import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { LABELS, toOptions } from "@/lib/format";
import { MANAGED_ROLES, ROLE_LABELS } from "@/lib/permissions";
import { createTeacherAction, deleteTeacherAction, updateTeacherAction } from "@/server/actions/admin";
import { listTeachers } from "@/server/services/catalog";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Giáo viên" };

const fields: Field[] = [
  { name: "code", label: "Mã GV", required: true },
  { name: "fullName", label: "Họ tên", required: true },
  { name: "phone", label: "Điện thoại" },
  { name: "email", label: "Email" },
  { name: "status", label: "Trạng thái", type: "select", required: true, options: toOptions(LABELS.teacherStatus), defaultValue: "active" },
];
// Vai trò quyết định bảng quyền của tài khoản gắn với giáo viên (Cấu hình → Phân quyền); chỉ Admin đặt được.
const roleField: Field = {
  name: "role",
  label: "Vai trò",
  type: "select",
  required: true,
  options: MANAGED_ROLES.map((role) => ({ value: role, label: ROLE_LABELS[role] })),
  defaultValue: "teacher",
  hint: "Tài khoản gắn với giáo viên này dùng quyền của vai trò đã chọn (Cấu hình → Phân quyền).",
};

export default async function TeachersPage() {
  const { actor, role, can } = await requireMenu("teachers");
  const teachers = await listTeachers(actor);
  return (
    <CrudSection
      title="Giáo viên"
      numbered
      columns={["Họ tên", "Mã GV", "Vai trò", "Điện thoại", "Email", "Trạng thái"]}
      rows={teachers.map((t) => ({
        id: t.id,
        cells: [t.fullName, t.code, ROLE_LABELS[t.role], t.phone ?? "", t.email ?? "", LABELS.teacherStatus[t.status]],
        values: { code: t.code, fullName: t.fullName, phone: t.phone ?? "", email: t.email ?? "", status: t.status, role: t.role },
      }))}
      fields={role === "admin" ? [...fields, roleField] : fields}
      createAction={can("add") ? createTeacherAction : undefined}
      updateAction={can("edit") ? updateTeacherAction : undefined}
      deleteAction={role === "admin" ? deleteTeacherAction : undefined}
    />
  );
}
