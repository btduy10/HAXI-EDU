import type { Metadata } from "next";
import { ConfirmButton, FormDialogButton } from "@/components/action-buttons";
import type { Field } from "@/components/form-dialog";
import { Badge } from "@/components/ui/badge";
import { LABELS, formatDateTime, toOptions } from "@/lib/format";
import {
  createAccountAction,
  deleteAccountAction,
  lockAccountAction,
  resetPasswordAction,
  resetTwoFactorAction,
  updateAccountAction,
} from "@/server/actions/admin";
import { listAccounts } from "@/server/services/accounts";
import { listTeachers } from "@/server/services/catalog";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Tài khoản" };

const ROLE_HINT = "Tài khoản gắn với giáo viên sẽ lấy vai trò Giáo viên / Giáo viên trực theo cột Vai trò ở menu Giáo viên.";
const PASSWORD_HINT = "Mật khẩu tạm, tối thiểu 8 ký tự gồm chữ và số. Người dùng phải đổi ở lần đăng nhập đầu.";

export default async function AccountsPage() {
  const user = await requirePageUser("admin");
  const [accounts, teachers] = await Promise.all([listAccounts(user.actor), listTeachers(user.actor)]);
  const now = new Date();

  const linked = new Set(accounts.map((a) => a.teacherId).filter(Boolean));
  const createFields: Field[] = [
    { name: "username", label: "Tên đăng nhập", required: true },
    { name: "name", label: "Tên hiển thị", required: true },
    { name: "role", label: "Vai trò", type: "select", required: true, options: toOptions(LABELS.role) },
    {
      name: "teacherId",
      label: "Giáo viên (với vai trò Giáo viên)",
      type: "select",
      options: teachers.filter((t) => !linked.has(t.id)).map((t) => ({ value: t.id, label: `${t.code} – ${t.fullName} (${LABELS.role[t.role]})` })),
      hint: ROLE_HINT,
    },
    { name: "password", label: "Mật khẩu tạm", type: "password", required: true, hint: PASSWORD_HINT },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">
          Tài khoản <span className="text-sm font-normal text-muted-foreground">({accounts.length})</span>
        </h1>
        <FormDialogButton
          label="Thêm tài khoản"
          title="Thêm tài khoản"
          fields={createFields}
          initial={{ role: "teacher" }}
          action={createAccountAction}
          successMessage="Đã tạo tài khoản."
        />
      </div>

      <ul className="grid gap-2">
        {accounts.map((a) => {
          const locked = Boolean(a.lockedUntil && a.lockedUntil > now);
          const isSelf = a.id === user.id;
          return (
            <li key={a.id} className="grid gap-2 rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{a.username}</span>
                <Badge variant={a.role === "admin" ? "default" : "secondary"}>{LABELS.role[a.role]}</Badge>
                {locked && <Badge variant="destructive">Đang khóa</Badge>}
                {a.mustChangePassword && <Badge variant="outline">Chưa đổi mật khẩu</Badge>}
                {a.twoFactorEnabled && <Badge variant="outline">2FA</Badge>}
              </div>
              <p className="text-muted-foreground">
                {a.name}
                {a.teacherName && ` · GV: ${a.teacherName}`}
                {a.lastLoginAt && ` · đăng nhập gần nhất ${formatDateTime(a.lastLoginAt)}`}
              </p>
              <div className="flex flex-wrap gap-2">
                <FormDialogButton
                  label="Sửa"
                  variant="outline"
                  className="h-9"
                  title={`Sửa tài khoản ${a.username}`}
                  description="Đổi tên đăng nhập, vai trò hoặc giáo viên gắn kèm sẽ đăng xuất tài khoản này khỏi mọi thiết bị."
                  fields={[
                    { name: "username", label: "Tên đăng nhập", required: true },
                    { name: "name", label: "Tên hiển thị", required: true },
                    { name: "role", label: "Vai trò", type: "select", required: true, options: toOptions(LABELS.role) },
                    {
                      name: "teacherId",
                      label: "Giáo viên (với vai trò Giáo viên)",
                      type: "select",
                      options: teachers
                        .filter((t) => t.id === a.teacherId || !linked.has(t.id))
                        .map((t) => ({ value: t.id, label: `${t.code} – ${t.fullName} (${LABELS.role[t.role]})` })),
                      hint: ROLE_HINT,
                    },
                  ]}
                  initial={{ username: a.username, name: a.name, role: a.role, teacherId: a.teacherId ?? "" }}
                  fixed={{ id: a.id }}
                  action={updateAccountAction}
                  successMessage="Đã cập nhật tài khoản."
                />
                <FormDialogButton
                  label="Đặt lại mật khẩu"
                  variant="outline"
                  className="h-9"
                  title={`Đặt lại mật khẩu cho ${a.username}`}
                  description={
                    isSelf
                      ? "Đặt mật khẩu mới cho chính bạn."
                      : "Tài khoản sẽ bị đăng xuất khỏi mọi thiết bị và được mở khóa nếu đang bị khóa."
                  }
                  fields={[
                    { name: "password", label: "Mật khẩu mới", type: "password", required: true, hint: "Tối thiểu 8 ký tự, gồm chữ và số." },
                    {
                      name: "mustChange",
                      label: "Sau khi đặt lại",
                      type: "select",
                      required: true,
                      options: [
                        { value: "true", label: "Bắt đổi mật khẩu ở lần đăng nhập sau" },
                        { value: "false", label: "Dùng luôn mật khẩu này" },
                      ],
                    },
                  ]}
                  initial={{ mustChange: isSelf ? "false" : "true" }}
                  fixed={{ id: a.id }}
                  action={resetPasswordAction}
                  successMessage="Đã đặt lại mật khẩu."
                />
                {/* Admin khóa/mở khóa bất kỳ tài khoản nào khác; không tự khóa chính mình để khỏi mất quyền quản trị. */}
                {!isSelf && (
                  <ConfirmButton
                    label={locked ? "Mở khóa" : "Khóa"}
                    className="h-9"
                    confirmText={
                      locked
                        ? `Mở khóa tài khoản ${a.username}?`
                        : `Khóa tài khoản ${a.username}? Tài khoản sẽ bị đăng xuất và không đăng nhập được cho tới khi bạn mở khóa.`
                    }
                    action={lockAccountAction}
                    input={{ id: a.id, locked: !locked }}
                    successMessage={locked ? "Đã mở khóa tài khoản." : "Đã khóa tài khoản."}
                  />
                )}
                {!isSelf && a.twoFactorEnabled && (
                  <ConfirmButton
                    label="Đặt lại 2FA"
                    className="h-9"
                    confirmText={`Xóa thiết lập xác thực hai lớp của ${a.username}?`}
                    action={resetTwoFactorAction}
                    input={{ id: a.id }}
                  />
                )}
                {!isSelf && (
                  <ConfirmButton
                    label="Xóa"
                    variant="destructive"
                    className="h-9"
                    confirmText={`Xóa hẳn tài khoản ${a.username}? Không hoàn tác được. Điểm danh, sao và nhật ký đã ghi vẫn được giữ.`}
                    action={deleteAccountAction}
                    input={{ id: a.id }}
                    successMessage="Đã xóa tài khoản."
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
