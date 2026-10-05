"use client";

import { MessageSquareIcon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { ActionFn } from "@/components/form-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

type Status = "present" | "late" | "left_early" | "excused" | "absent";
type Row = { studentId: string; code: string; fullName: string; status: Status; note: string };

// Nhãn ngắn để 5 nút vừa một hàng trên màn hình 360px.
const STATUSES: { value: Status; short: string; label: string; active: string }[] = [
  { value: "present", short: "Có", label: "Có mặt", active: "bg-emerald-600 text-white border-emerald-600" },
  { value: "late", short: "Trễ", label: "Đi trễ", active: "bg-amber-500 text-white border-amber-500" },
  { value: "left_early", short: "Về sớm", label: "Về sớm", active: "bg-amber-500 text-white border-amber-500" },
  { value: "excused", short: "Phép", label: "Vắng có phép", active: "bg-sky-600 text-white border-sky-600" },
  { value: "absent", short: "Vắng", label: "Vắng không phép", active: "bg-red-600 text-white border-red-600" },
];

export function AttendanceSheet({
  sessionId,
  initialRows,
  initialContent,
  recorded,
  blockedReason,
  saveAction,
}: {
  sessionId: string;
  initialRows: Row[];
  initialContent: string;
  recorded: boolean;
  blockedReason: string | null;
  saveAction: ActionFn;
}) {
  const [rows, setRows] = useState(initialRows);
  const [content, setContent] = useState(initialContent);
  const [noteOpen, setNoteOpen] = useState<Set<string>>(() => new Set(initialRows.filter((r) => r.note).map((r) => r.studentId)));
  const [dirty, setDirty] = useState(!recorded);
  const [pending, startTransition] = useTransition();
  const readOnly = Boolean(blockedReason);

  const update = (studentId: string, patch: Partial<Row>) => {
    setRows((current) => current.map((r) => (r.studentId === studentId ? { ...r, ...patch } : r)));
    setDirty(true);
  };

  function save() {
    startTransition(async () => {
      const result = await saveAction({
        sessionId,
        content,
        entries: rows.map((r) => ({ studentId: r.studentId, status: r.status, note: r.note })),
      });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Đã lưu điểm danh.");
      setDirty(false);
    });
  }

  const counts = STATUSES.map((s) => ({ ...s, count: rows.filter((r) => r.status === s.value).length })).filter((s) => s.count > 0);

  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Buổi học không có học viên nào.</p>;
  }

  return (
    <div className="grid gap-3 pb-24">
      {blockedReason && (
        <Alert>
          <AlertDescription>{blockedReason}</AlertDescription>
        </Alert>
      )}
      {!readOnly && !recorded && (
        <p className="text-sm text-muted-foreground">Mặc định cả lớp có mặt. Chỉ cần sửa những em khác rồi bấm Lưu.</p>
      )}

      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.studentId} className="grid gap-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 font-medium break-words">
                {row.fullName} <span className="text-sm font-normal text-muted-foreground">{row.code}</span>
              </p>
              {!readOnly && (
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={`Ghi chú cho ${row.fullName}`}
                  aria-expanded={noteOpen.has(row.studentId)}
                  onClick={() =>
                    setNoteOpen((current) => {
                      const next = new Set(current);
                      if (!next.delete(row.studentId)) next.add(row.studentId);
                      return next;
                    })
                  }
                >
                  <MessageSquareIcon />
                </Button>
              )}
            </div>
            <div role="radiogroup" aria-label={`Điểm danh ${row.fullName}`} className="grid grid-cols-5 gap-1">
              {STATUSES.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  role="radio"
                  aria-checked={row.status === s.value}
                  aria-label={s.label}
                  disabled={readOnly}
                  onClick={() => update(row.studentId, { status: s.value })}
                  className={cn(
                    "h-11 rounded-md border px-0.5 text-xs font-medium transition-colors disabled:opacity-70",
                    row.status === s.value ? s.active : "bg-background hover:bg-muted",
                  )}
                >
                  {s.short}
                </button>
              ))}
            </div>
            {(noteOpen.has(row.studentId) || (readOnly && row.note)) && (
              <Input
                value={row.note}
                maxLength={200}
                readOnly={readOnly}
                placeholder="Ghi chú (không bắt buộc)"
                aria-label={`Nội dung ghi chú cho ${row.fullName}`}
                className="h-10"
                onChange={(e) => update(row.studentId, { note: e.target.value })}
              />
            )}
          </li>
        ))}
      </ul>

      <div className="grid gap-1.5">
        <Label htmlFor="session-content">Nội dung buổi học</Label>
        <Textarea
          id="session-content"
          value={content}
          maxLength={500}
          readOnly={readOnly}
          rows={2}
          onChange={(e) => {
            setContent(e.target.value);
            setDirty(true);
          }}
        />
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background p-3 md:left-60">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="min-w-0 text-xs text-muted-foreground">
            {counts.map((c) => `${c.label}: ${c.count}`).join(" · ")}
          </p>
          {!readOnly && (
            <Button className="h-11 shrink-0 px-5" disabled={pending || !dirty} onClick={save}>
              {pending ? "Đang lưu…" : recorded && !dirty ? "Đã lưu" : "Lưu điểm danh"}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
