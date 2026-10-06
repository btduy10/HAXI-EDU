import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { LABELS, toOptions } from "@/lib/format";
import { roleLabel, roleOptions } from "@/lib/permissions";
import { createTeacherAction, deleteTeacherAction, updateTeacherAction } from "@/server/actions/admin";
import { listTeachers } from "@/server/services/catalog";
import { requireMenu } from "@/server/session";
import { getPermissionConfig } from "@/server/settings";

export const metadata: Metadata = { title: "Giáo viên" };

const fields: Field[] = [
  { name: "code", label: "Mã GV", required: true },
  { name: "fullName", label: "Họ tên", required: true },
  { name: "phone", label: "Điện thoại" },
  { name: "email", label: "Email" },
  { name: "status", label: "Trạng thái", type: "select", required: true, options: toOptions(LABELS.teacherStatus), defaultValue: "active" },
];


export default async function TeachersPage() {
  const { actor, role, can } = await requireMenu("teachers");
  const [teachers, roles] = await Promise.all([listTeachers(actor), getPermissionConfig()]);
  // Vai trò (tạo ở Cấu hình → Phân quyền) quyết định bảng quyền của tài khoản gắn với giáo viên; chỉ Admin đặt được.
  const roleField: Field = {
    name: "role",
    label: "Vai trò",
    type: "select",
    required: true,
    options: roleOptions(roles),
    defaultValue: "teacher",
    hint: "Tài khoản gắn với giáo viên này dùng quyền của vai trò đã chọn (Cấu hình → Phân quyền).",
  };
  return (
    <CrudSection
      title="Giáo viên"
      numbered
      columns={["Họ tên", "Mã GV", "Vai trò", "Điện thoại", "Email", "Trạng thái"]}
      rows={teachers.map((t) => ({
        id: t.id,
        cells: [t.fullName, t.code, roleLabel(roles, t.role), t.phone ?? "", t.email ?? "", LABELS.teacherStatus[t.status]],
        values: { code: t.code, fullName: t.fullName, phone: t.phone ?? "", email: t.email ?? "", status: t.status, role: t.role },
      }))}
      fields={role === "admin" ? [...fields, roleField] : fields}
      createAction={can("add") ? createTeacherAction : undefined}
      updateAction={can("edit") ? updateTeacherAction : undefined}
      deleteAction={role === "admin" ? deleteTeacherAction : undefined}
    />
  );
}
