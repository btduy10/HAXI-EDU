"use client";

import { PlusIcon, Trash2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type ActionFn, selectClass } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  ACTION_LABELS,
  type ClassScope,
  MAX_ROLES,
  type Menu,
  NO_PERMISSIONS,
  PERMISSION_ACTIONS,
  PERMISSION_MENUS,
  type PermissionAction,
  type PermissionConfig,
  type RolePermissions,
  ROLE_LABEL_MAX,
  SCOPE_LABELS,
  isBuiltinRole,
} from "@/lib/permissions";

const ROLE_HINTS: Record<string, string> = {
  teacher: "Tài khoản của giáo viên đứng lớp.",
  duty_teacher: "Tài khoản trực trung tâm: hỗ trợ điểm danh, nhắc giáo viên.",
};

/**
 * Một bảng phân quyền duy nhất: chọn vai trò ở ô "Vai trò" rồi tick Xem / Thêm / Sửa theo menu.
 * Admin tạo thêm, đổi tên, xóa vai trò tại đây. Chỉ Admin dùng; máy chủ kiểm tra lại khi lưu.
 */
export function PermissionMatrix({
  initial,
  action,
  members,
}: {
  initial: PermissionConfig;
  action: ActionFn;
  /** Số tài khoản và tên giáo viên đang mang từng vai trò. */
  members: Record<string, { accounts: number; teachers: string[] }>;
}) {
  const [config, setConfig] = useState(initial);
  const [role, setRole] = useState(Object.keys(initial)[0] ?? "teacher");
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(config) !== JSON.stringify(initial);
  const keys = Object.keys(config);
  const current = config[role] ?? config[keys[0]!]!;
  const builtin = isBuiltinRole(role);
  const usage = members[role] ?? { accounts: 0, teachers: [] };
  const inUse = usage.accounts > 0 || usage.teachers.length > 0;

  const patchRole = (patch: Partial<PermissionConfig[string]>) => setConfig((prev) => ({ ...prev, [role]: { ...prev[role]!, ...patch } }));

  function addRole() {
    const key = `role_${Date.now().toString(36)}`;
    const base = "Vai trò mới";
    const taken = new Set(Object.values(config).map((r) => r.label));
    let label = base;
    for (let n = 2; taken.has(label); n++) label = `${base} ${n}`;
    setConfig((prev) => ({ ...prev, [key]: { label, scope: NO_PERMISSIONS.scope, menus: structuredClone(NO_PERMISSIONS.menus) } }));
    setRole(key);
  }

  function removeRole() {
    if (!window.confirm(`Xóa vai trò "${current.label}"? Thay đổi có hiệu lực sau khi bấm Lưu phân quyền.`)) return;
    setConfig((prev) => Object.fromEntries(Object.entries(prev).filter(([key]) => key !== role)));
    setRole(keys.find((key) => key !== role) ?? "teacher");
  }

  function save() {
    startTransition(async () => {
      const result = await action(config);
      if (result.ok) toast.success("Đã lưu phân quyền.");
      else toast.error(result.fieldErrors ? `${result.error} ${Object.values(result.fieldErrors)[0] ?? ""}` : result.error, { duration: 8000 });
    });
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-lg border p-3" aria-label={`Quyền của ${current.label}`}>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium sm:max-w-sm">
            Vai trò
            <select className={selectClass} value={role} aria-label="Vai trò" onChange={(event) => setRole(event.target.value)}>
              {keys.map((key) => (
                <option key={key} value={key}>
                  {config[key]!.label} ({members[key]?.accounts ?? 0} tài khoản)
                </option>
              ))}
            </select>
          </label>
          <Button type="button" variant="outline" className="h-11" disabled={keys.length >= MAX_ROLES} onClick={addRole}>
            <PlusIcon /> Thêm vai trò
          </Button>
          {!builtin && (
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={inUse}
              title={inUse ? "Vai trò đang được gán cho tài khoản hoặc giáo viên" : undefined}
              onClick={removeRole}
            >
              <Trash2Icon /> Xóa vai trò
            </Button>
          )}
        </div>

        <label className="grid gap-1.5 text-sm font-medium sm:max-w-sm">
          Tên vai trò
          <Input
            className="h-11"
            value={current.label}
            maxLength={ROLE_LABEL_MAX}
            disabled={builtin}
            aria-label="Tên vai trò"
            onChange={(event) => patchRole({ label: event.target.value })}
          />
        </label>

        <p className="text-sm text-muted-foreground">
          {builtin ? `${ROLE_HINTS[role]} Vai trò có sẵn: không đổi tên, không xóa được.` : "Vai trò do bạn tạo: đổi tên được; chỉ xóa được khi chưa gán cho ai."}{" "}
          {usage.teachers.length > 0 ? (
            <>
              Giáo viên mang vai trò này: <span className="text-foreground">{usage.teachers.join(", ")}</span>.
            </>
          ) : (
            "Chưa có giáo viên nào mang vai trò này."
          )}{" "}
          Gán vai trò ở cột Vai trò trong menu Giáo viên, hoặc khi tạo tài khoản.
        </p>

        <PermissionTable value={current} name={current.label} onChange={patchRole} />
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="h-10" disabled={pending || !dirty} onClick={save}>
          Lưu phân quyền
        </Button>
        {dirty && <p className="text-sm text-muted-foreground">Có thay đổi chưa lưu (lưu một lần cho mọi vai trò).</p>}
      </div>
    </div>
  );
}

/**
 * Bảng tick dùng chung cho vai trò và cho từng tài khoản: Phạm vi lớp + Menu × Xem / Thêm / Sửa.
 * Bỏ Xem thì bỏ luôn Thêm/Sửa; tick Thêm/Sửa thì tự tick Xem. Không có `onChange` thì chỉ đọc.
 */
function PermissionTable({
  value,
  name,
  onChange,
  scopeLabel = "Phạm vi lớp được thấy",
}: {
  value: RolePermissions;
  /** Tên vai trò/tài khoản, dùng cho nhãn ô tick. */
  name: string;
  onChange?: (patch: Partial<RolePermissions>) => void;
  /** Nhãn của ô Phạm vi lớp (khác nhau giữa bảng vai trò và bảng tài khoản trên cùng trang). */
  scopeLabel?: string;
}) {
  const readOnly = !onChange;

  function toggle(menu: Menu, act: PermissionAction, checked: boolean) {
    const item = value.menus[menu];
    const next =
      act === "view"
        ? checked
          ? { ...item, view: true }
          : { view: false, add: false, edit: false }
        : { ...item, [act]: checked, view: item.view || checked };
    onChange?.({ menus: { ...value.menus, [menu]: next } });
  }

  return (
    <>
      <label className="grid gap-1.5 text-sm font-medium sm:max-w-sm">
        Phạm vi lớp được thấy
        <select
          className={selectClass}
          value={value.scope}
          disabled={readOnly}
          aria-label={scopeLabel}
          onChange={(event) => onChange?.({ scope: event.target.value as ClassScope })}
        >
          {(Object.keys(SCOPE_LABELS) as ClassScope[]).map((scope) => (
            <option key={scope} value={scope}>
              {SCOPE_LABELS[scope]}
            </option>
          ))}
        </select>
      </label>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="py-2 pr-2 font-medium">Menu</th>
              {PERMISSION_ACTIONS.map((act) => (
                <th key={act} className="w-14 py-2 text-center font-medium">
                  {ACTION_LABELS[act]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {PERMISSION_MENUS.map((menu) => (
              <tr key={menu.key} className="border-b last:border-0">
                <td className="py-2 pr-2">
                  {menu.label}
                  {menu.hint && <span className="block text-xs text-muted-foreground">{menu.hint}</span>}
                </td>
                {PERMISSION_ACTIONS.map((act) => (
                  <td key={act} className="text-center">
                    {(menu.actions as readonly PermissionAction[]).includes(act) ? (
                      <input
                        type="checkbox"
                        className="size-5 align-middle accent-primary"
                        checked={value.menus[menu.key][act]}
                        disabled={readOnly}
                        onChange={(event) => toggle(menu.key, act, event.target.checked)}
                        aria-label={`${name}: ${ACTION_LABELS[act]} ${menu.label}`}
                      />
                    ) : (
                      <span className="text-muted-foreground" aria-hidden>
                        –
                      </span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export type AccountPermissionRow = { id: string; username: string; name: string; role: string; permissions: RolePermissions | null };

/**
 * Quyền riêng từng tài khoản: chọn tài khoản, bật "Phân quyền riêng" để ghi đè quyền của vai trò (gồm phạm vi lớp).
 * Tắt thì tài khoản theo quyền của vai trò. Lưu từng tài khoản; máy chủ kiểm tra lại khi lưu.
 */
export function AccountPermissions({
  accounts,
  roles,
  action,
}: {
  accounts: AccountPermissionRow[];
  roles: PermissionConfig;
  action: ActionFn;
}) {
  const [saved, setSaved] = useState(() => Object.fromEntries(accounts.map((a) => [a.id, a.permissions])));
  const [drafts, setDrafts] = useState(saved);
  const [selected, setSelected] = useState(accounts[0]?.id ?? "");
  const [pending, startTransition] = useTransition();
  const current = accounts.find((a) => a.id === selected);
  if (!current) return <p className="text-sm text-muted-foreground">Chưa có tài khoản nào ngoài Quản trị.</p>;

  const known = Object.hasOwn(roles, current.role);
  const rolePerms = known ? roles[current.role]! : NO_PERMISSIONS;
  const roleName = known ? roles[current.role]!.label : "Vai trò đã xóa";
  const draft = drafts[current.id] ?? null;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved[current.id] ?? null);
  const accountName = `${current.username} – ${current.name}`;
  const setDraft = (value: RolePermissions | null) => setDrafts((prev) => ({ ...prev, [current.id]: value }));

  function save() {
    const { id, username } = current!;
    startTransition(async () => {
      const result = await action({ userId: id, permissions: draft });
      if (!result.ok) return void toast.error(result.error, { duration: 8000 });
      setSaved((prev) => ({ ...prev, [id]: draft }));
      toast.success(`Đã lưu quyền của tài khoản ${username}.`);
    });
  }

  return (
    <div className="grid gap-4">
      <section className="grid gap-3 rounded-lg border p-3" aria-label={`Quyền riêng của ${accountName}`}>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium sm:max-w-sm">
          Tài khoản
          <select className={selectClass} value={current.id} aria-label="Tài khoản" onChange={(event) => setSelected(event.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.username} – {a.name}
                {saved[a.id] ? " (quyền riêng)" : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            className="size-5 accent-primary"
            checked={draft !== null}
            onChange={(event) => setDraft(event.target.checked ? { scope: rolePerms.scope, menus: structuredClone(rolePerms.menus) } : null)}
          />
          Phân quyền riêng cho tài khoản này
        </label>
        <p className="text-sm text-muted-foreground">
          {draft
            ? `Tài khoản dùng quyền riêng dưới đây thay cho quyền của vai trò ${roleName}. Bỏ tick để quay về quyền của vai trò.`
            : `Đang theo quyền của vai trò ${roleName} (chỉ xem). Tick ô trên để chỉnh riêng cho tài khoản này.`}
        </p>
        <PermissionTable
          value={draft ?? rolePerms}
          name={accountName}
          scopeLabel="Phạm vi lớp của tài khoản"
          onChange={draft ? (patch) => setDraft({ ...draft, ...patch }) : undefined}
        />
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" className="h-10" disabled={pending || !dirty} onClick={save}>
          Lưu quyền tài khoản
        </Button>
        {dirty && <p className="text-sm text-muted-foreground">Có thay đổi chưa lưu cho tài khoản này.</p>}
      </div>
    </div>
  );
}
