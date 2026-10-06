import type { Metadata } from "next";
import { FormDialogButton } from "@/components/action-buttons";
import { PermissionMatrix } from "@/components/permission-matrix";
import { updatePermissionsAction, updateSettingsAction } from "@/server/actions/rewards";
import { listAccounts } from "@/server/services/accounts";
import { listTeachers } from "@/server/services/catalog";
import { readPermissions, readSettings } from "@/server/services/reports";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Cấu hình" };

export default async function SettingsPage() {
  const { actor } = await requirePageUser("admin");
  const [settings, permissions, teachers, accounts] = await Promise.all([
    readSettings(actor),
    readPermissions(actor),
    listTeachers(actor),
    listAccounts(actor),
  ]);
  // Ai đang mang từng vai trò: số tài khoản và tên giáo viên (cột Vai trò ở menu Giáo viên).
  const members = Object.fromEntries(
    Object.keys(permissions).map((role) => [
      role,
      {
        accounts: accounts.filter((a) => a.role === role).length,
        teachers: teachers.filter((t) => t.role === role && t.status === "active").map((t) => t.fullName),
      },
    ]),
  );
  const items = [
    {
      label: "Khóa sửa điểm danh sau",
      value: `${settings.attendance_lock_days} ngày`,
      hint: "Quá số ngày này kể từ ngày học, chỉ sửa được điểm danh sau khi Admin mở khóa (mỗi lần 24 giờ).",
    },
    {
      label: "Trừ sao tối đa mỗi học viên mỗi buổi",
      value: `${settings.max_deduction_per_session} sao`,
      hint: "Các lần trừ đã hoàn tác không tính vào giới hạn.",
    },
  ];
  return (
    <div className="grid max-w-2xl gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">Cấu hình</h1>
        <FormDialogButton
          label="Sửa cấu hình"
          title="Sửa cấu hình"
          fields={[
            { name: "attendance_lock_days", label: "Khóa sửa điểm danh sau (ngày)", type: "number", required: true },
            { name: "max_deduction_per_session", label: "Trừ sao tối đa mỗi buổi", type: "number", required: true },
          ]}
          initial={{
            attendance_lock_days: String(settings.attendance_lock_days),
            max_deduction_per_session: String(settings.max_deduction_per_session),
          }}
          action={updateSettingsAction}
        />
      </div>
      <dl className="grid gap-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border p-3">
            <dt className="text-sm text-muted-foreground">{item.label}</dt>
            <dd className="text-lg font-semibold">{item.value}</dd>
            <dd className="text-sm text-muted-foreground">{item.hint}</dd>
          </div>
        ))}
      </dl>

      <section className="grid gap-3">
        <div>
          <h2 className="text-lg font-semibold">Phân quyền</h2>
          <p className="text-sm text-muted-foreground">
            Chọn <strong>Vai trò</strong> rồi tick quyền cho vai trò đó; bấm <strong>Thêm vai trò</strong> để tạo vai trò mới dùng khi tạo
            tài khoản. Tick <strong>Xem</strong> để menu hiện trên thanh menu của vai trò đó; <strong>Thêm</strong>, <strong>Sửa</strong> mở các nút
            tương ứng. Quản trị luôn có toàn quyền. Xóa dữ liệu và các menu Tài khoản, Nhật ký, Cấu hình luôn chỉ dành cho Quản trị. Mọi
            vai trò ngoài Quản trị luôn có khu vực giảng dạy (Tổng quan, thời khóa biểu, lớp) trong phạm vi lớp đã chọn.
          </p>
        </div>
        <PermissionMatrix initial={permissions} action={updatePermissionsAction} members={members} />
      </section>
    </div>
  );
}