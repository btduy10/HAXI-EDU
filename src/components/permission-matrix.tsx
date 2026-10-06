"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type ActionFn, selectClass } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import {
  ACTION_LABELS,
  type ClassScope,
  MANAGED_ROLES,
  type ManagedRole,
  type Menu,
  PERMISSION_ACTIONS,
  PERMISSION_MENUS,
  type PermissionAction,
  type PermissionConfig,
  ROLE_LABELS,
  SCOPE_LABELS,
} from "@/lib/permissions";
import { cn } from "@/lib/utils";

const ROLE_HINTS: Record<ManagedRole, string> = {
  teacher: "Tài khoản của giáo viên đứng lớp.",
  duty_teacher: "Tài khoản trực trung tâm: hỗ trợ điểm danh, nhắc giáo viên.",
};

/** Bảng tick quyền Xem / Thêm / Sửa theo menu cho từng vai trò. Chỉ Admin dùng; máy chủ kiểm tra lại khi lưu. */
export function PermissionMatrix({
  initial,
  action,
  members,
}: {
  initial: PermissionConfig;
  action: ActionFn;
  /** Giáo viên đang mang từng vai trò (lấy từ cột Vai trò ở menu Giáo viên). */
  members: Record<ManagedRole, string[]>;
}) {
  const [config, setConfig] = useState(initial);
  // Một bảng duy nhất: chọn vai trò ở ô "Vai trò" để xem và tick quyền của vai trò đó.
  const [role, setRole] = useState<ManagedRole>("teacher");
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(config) !== JSON.stringify(initial);

  function toggle(
    role: ManagedRole,
    menu: Menu,
    act: PermissionAction,
    checked: boolean,
  ) {
    setConfig((prev) => {
      const current = prev[role].menus[menu];
      // Bỏ Xem thì bỏ luôn Thêm/Sửa; tick Thêm/Sửa thì tự tick Xem.
      const next =
        act === "view"
          ? checked
            ? { ...current, view: true }
            : { view: false, add: false, edit: false }
          : { ...current, [act]: checked, view: current.view || checked };
      return {
        ...prev,
        [role]: { ...prev[role], menus: { ...prev[role].menus, [menu]: next } },
      };
    });
  }

  function setScope(role: ManagedRole, scope: ClassScope) {
    setConfig((prev) => ({ ...prev, [role]: { ...prev[role], scope } }));
  }

  function save() {
    startTransition(async () => {
      const result = await action(config);
      if (result.ok) toast.success("Đã lưu phân quyền.");
      else toast.error(result.error);
    });
  }

  return (
    <div className="grid gap-4">
      <section
        className="grid gap-3 rounded-lg border p-3"
        aria-label={`Quyền của ${ROLE_LABELS[role]}`}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1.5 text-sm font-medium">
            Vai trò
            <select
              className={selectClass}
              value={role}
              aria-label="Vai trò"
              onChange={(event) => setRole(event.target.value as ManagedRole)}
            >
              {MANAGED_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]} ({members[r].length} giáo viên)
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Phạm vi lớp được thấy
            <select
              className={selectClass}
              value={config[role].scope}
              onChange={(event) =>
                setScope(role, event.target.value as ClassScope)
              }
              aria-label={`Phạm vi lớp của ${ROLE_LABELS[role]}`}
            >
              {(Object.keys(SCOPE_LABELS) as ClassScope[]).map((scope) => (
                <option key={scope} value={scope}>
                  {SCOPE_LABELS[scope]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-sm text-muted-foreground">
          {ROLE_HINTS[role]}{" "}
          {members[role].length > 0 ? (
            <>
              Giáo viên mang vai trò này:{" "}
              <span className="text-foreground">
                {members[role].join(", ")}
              </span>
              .
            </>
          ) : (
            "Chưa có giáo viên nào mang vai trò này."
          )}{" "}
          Đổi vai trò của từng người ở cột Vai trò trong menu Giáo viên.
        </p>
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
                    {menu.hint && (
                      <span className="block text-xs text-muted-foreground">
                        {menu.hint}
                      </span>
                    )}
                  </td>
                  {PERMISSION_ACTIONS.map((act) => {
                    const supported = (
                      menu.actions as readonly PermissionAction[]
                    ).includes(act);
                    return (
                      <td key={act} className="text-center">
                        {supported ? (
                          <input
                            type="checkbox"
                            className={cn("size-5 accent-primary align-middle")}
                            checked={config[role].menus[menu.key][act]}
                            onChange={(event) =>
                              toggle(role, menu.key, act, event.target.checked)
                            }
                            aria-label={`${ROLE_LABELS[role]}: ${ACTION_LABELS[act]} ${menu.label}`}
                          />
                        ) : (
                          <span className="text-muted-foreground" aria-hidden>
                            –
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          className="h-10"
          disabled={pending || !dirty}
          onClick={save}
        >
          Lưu phân quyền
        </Button>
        {dirty && (
          <p className="text-sm text-muted-foreground">
            Có thay đổi chưa lưu (lưu một lần cho cả hai vai trò).
          </p>
        )}
      </div>
    </div>
  );
}
