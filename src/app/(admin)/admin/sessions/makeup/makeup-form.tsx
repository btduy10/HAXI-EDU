"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { type FieldOption, selectClass, showWarnings } from "@/components/form-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createMakeupAction } from "@/server/actions/schedule";

export function MakeupForm({
  classId,
  defaults,
  students,
  teachers,
  rooms,
}: {
  classId: string;
  defaults: { date: string; startTime: string; endTime: string; roomId: string; teacherId: string };
  students: { id: string; label: string }[];
  teachers: FieldOption[];
  rooms: FieldOption[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setError(null);
    startTransition(async () => {
      const result = await createMakeupAction({
        classId,
        date: form.get("date"),
        startTime: form.get("startTime"),
        endTime: form.get("endTime"),
        roomId: form.get("roomId"),
        teacherId: form.get("teacherId"),
        note: form.get("note"),
        studentIds: [...selected],
      });
      if (!result.ok) {
        setError([result.error, ...Object.values(result.fieldErrors ?? {})].join(" "));
        return;
      }
      toast.success("Đã thêm buổi bù.");
      showWarnings(result.data);
      router.push(`/admin/sessions/${result.data.id}`);
    });
  }

  return (
    <form onSubmit={submit} className="grid gap-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <Label htmlFor="date">Ngày học bù</Label>
          <Input id="date" name="date" type="date" defaultValue={defaults.date} required className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="startTime">Giờ bắt đầu</Label>
          <Input id="startTime" name="startTime" type="time" defaultValue={defaults.startTime} required className="h-11" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="endTime">Giờ kết thúc</Label>
          <Input id="endTime" name="endTime" type="time" defaultValue={defaults.endTime} required className="h-11" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="teacherId">Giáo viên</Label>
          <select id="teacherId" name="teacherId" defaultValue={defaults.teacherId} required className={selectClass}>
            <option value="">— Chọn —</option>
            {teachers.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="roomId">Phòng</Label>
          <select id="roomId" name="roomId" defaultValue={defaults.roomId} className={selectClass}>
            <option value="">— Không chọn —</option>
            {rooms.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">
          Học viên học bù <span className="font-normal text-muted-foreground">(đã chọn {selected.size})</span>
        </legend>
        {students.length === 0 ? (
          <p className="text-sm text-muted-foreground">Lớp chưa có học viên.</p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2">
            {students.map((s) => (
              <label key={s.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border px-3 text-sm has-checked:bg-muted">
                <input type="checkbox" className="size-4" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
                {s.label}
              </label>
            ))}
          </div>
        )}
      </fieldset>

      <div className="grid gap-1.5">
        <Label htmlFor="note">Ghi chú</Label>
        <Textarea id="note" name="note" rows={2} maxLength={500} />
      </div>

      <Button type="submit" className="h-11 sm:w-fit" disabled={pending || selected.size === 0}>
        {pending ? "Đang lưu…" : "Thêm buổi bù"}
      </Button>
    </form>
  );
}
