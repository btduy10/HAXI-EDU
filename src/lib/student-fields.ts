import type { Field } from "@/components/form-dialog";
import { LABELS, toOptions } from "@/lib/format";

/** Thông tin chỉ Admin được xem và nhập; vai trò khác không có các ô này trên form. */
export const STUDENT_PRIVATE_FIELDS = ["birthDate", "gender", "guardianName", "phone", "note"];

/**
 * Các ô của form học viên, dùng chung cho menu QL Học viên và form "Học viên mới" ở Ghi danh.
 * `suggestedCode`: mã tự cấp kế tiếp, điền sẵn ở form thêm mới (người dùng vẫn sửa được).
 */
export function studentFields({ admin, suggestedCode }: { admin: boolean; suggestedCode?: string }): Field[] {
  const fields: Field[] = [
    {
      name: "code",
      label: "Mã HV",
      required: true,
      defaultValue: suggestedCode,
      hint: suggestedCode ? "Mã tự điền theo năm và số thứ tự; sửa được nếu cần." : undefined,
    },
    { name: "fullName", label: "Họ tên", required: true },
    { name: "birthDate", label: "Ngày sinh", type: "date" },
    { name: "gender", label: "Giới tính", type: "select", options: toOptions(LABELS.gender) },
    { name: "schoolGrade", label: "Khối lớp (1–12)", type: "number" },
    { name: "guardianName", label: "Phụ huynh" },
    { name: "phone", label: "Điện thoại liên hệ" },
    { name: "status", label: "Trạng thái", type: "select", required: true, options: toOptions(LABELS.studentStatus), defaultValue: "active" },
    { name: "note", label: "Ghi chú", type: "textarea" },
  ];
  return admin ? fields : fields.filter((f) => !STUDENT_PRIVATE_FIELDS.includes(f.name));
}
