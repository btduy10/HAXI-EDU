"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type FieldOption = { value: string; label: string };
export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "date" | "time" | "textarea" | "select" | "password";
  options?: FieldOption[];
  required?: boolean;
  hint?: string;
  /** Giá trị ban đầu khi form không có dữ liệu sẵn (form thêm mới). */
  defaultValue?: string;
};

export type ActionFn = (input: unknown) => Promise<{ ok: true; data: unknown } | { ok: false; error: string; fieldErrors?: Record<string, string> }>;

/** Cảnh báo không chặn (vd. vượt sức chứa phòng) mà service trả về kèm kết quả. */
export function showWarnings(data: unknown) {
  const warnings = (data as { warnings?: unknown } | null)?.warnings;
  if (Array.isArray(warnings)) for (const w of warnings) toast.warning(String(w), { duration: 10_000 });
  showLevelChanges(data);
}

type LevelChangeNotice = { fullName: string; direction: "up" | "down"; fromLevel: string; toLevel: string; avatarSwitchedTo: string | null };

/** Thông báo cho GV khi học viên lên cấp (chúc mừng) hoặc tụt cấp (kèm avatar bị tự đổi). */
export function showLevelChanges(data: unknown) {
  const changes = (data as { levelChanges?: unknown } | null)?.levelChanges;
  if (!Array.isArray(changes)) return;
  for (const c of changes as LevelChangeNotice[]) {
    const avatar = c.avatarSwitchedTo ? ` Avatar đang dùng bị khóa nên đã tự đổi sang "${c.avatarSwitchedTo}".` : "";
    if (c.direction === "up" && c.fromLevel !== c.toLevel) {
      toast.success(`Chúc mừng! ${c.fullName} đã lên cấp ${c.toLevel}.`, { duration: 10_000 });
    } else {
      const level = c.fromLevel !== c.toLevel ? `${c.fullName} tụt từ cấp ${c.fromLevel} xuống ${c.toLevel}.` : `${c.fullName}:`;
      toast.warning(`${level}${avatar}`, { duration: 12_000 });
    }
  }
}

export const selectClass =
  "h-11 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50";

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  fields,
  initial,
  submitLabel = "Lưu",
  successMessage = "Đã lưu.",
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  fields: Field[];
  initial?: Record<string, string>;
  submitLabel?: string;
  successMessage?: string;
  onSubmit: (values: Record<string, string>) => ReturnType<ActionFn>;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const values: Record<string, string> = {};
    for (const field of fields) values[field.name] = String(form.get(field.name) ?? "");
    setPending(true);
    setError(null);
    setFieldErrors({});
    const result = await onSubmit(values);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      // Lỗi của form sửa có dạng "data.<trường>".
      const errors = Object.fromEntries(
        Object.entries(result.fieldErrors ?? {}).map(([k, v]) => [k.replace(/^data\./, ""), v]),
      );
      setFieldErrors(errors);
      // Đưa con trỏ tới ô lỗi đầu tiên để người dùng thấy ngay trên màn hình nhỏ.
      const firstInvalid = fields.find((f) => errors[f.name]);
      if (firstInvalid) document.getElementById(`f-${firstInvalid.name}`)?.focus();
      return;
    }
    toast.success(successMessage);
    showWarnings(result.data);
    onOpenChange(false);
  }

  function handleOpenChange(next: boolean) {
    if (!next) {
      setError(null);
      setFieldErrors({});
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-3" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {fields.map((field) => {
            const id = `f-${field.name}`;
            const invalid = Boolean(fieldErrors[field.name]);
            const common = {
              id,
              name: field.name,
              defaultValue: initial?.[field.name] ?? field.defaultValue ?? "",
              "aria-invalid": invalid || undefined,
              "aria-describedby": invalid ? `${id}-err` : undefined,
            };
            return (
              <div key={field.name} className="grid gap-1.5">
                <Label htmlFor={id}>
                  {field.label}
                  {field.required && <span className="text-destructive"> *</span>}
                </Label>
                {field.type === "select" ? (
                  <select {...common} className={selectClass}>
                    {!field.required && <option value="">— Không chọn —</option>}
                    {field.required && !initial?.[field.name] && !field.defaultValue && <option value="">— Chọn —</option>}
                    {field.options?.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === "textarea" ? (
                  <Textarea {...common} rows={3} />
                ) : (
                  <Input
                    {...common}
                    type={field.type ?? "text"}
                    inputMode={field.type === "number" ? "numeric" : undefined}
                    autoComplete={field.type === "password" ? "new-password" : "off"}
                    className="h-11"
                  />
                )}
                {field.hint && !invalid && <p className="text-xs text-muted-foreground">{field.hint}</p>}
                {invalid && (
                  <p id={`${id}-err`} className="text-xs text-destructive">
                    {fieldErrors[field.name]}
                  </p>
                )}
              </div>
            );
          })}
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" className="h-11 sm:h-9" onClick={() => handleOpenChange(false)}>
              Hủy
            </Button>
            <Button type="submit" className="h-11 sm:h-9" disabled={pending}>
              {pending ? "Đang lưu…" : submitLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
