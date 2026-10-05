import type { Metadata } from "next";
import { FormDialogButton } from "@/components/action-buttons";
import { updateSettingsAction } from "@/server/actions/rewards";
import { readSettings } from "@/server/services/reports";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Cấu hình" };

export default async function SettingsPage() {
  const { actor } = await requirePageUser("admin");
  const settings = await readSettings(actor);
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
    </div>
  );
}