"use client";

import { StarIcon, Undo2Icon } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { AvatarBadge } from "@/components/avatar";
import { showLevelChanges } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { awardStarsAction, undoStarAction } from "@/server/actions/stars";

type Student = {
  studentId: string;
  code: string;
  fullName: string;
  sessionStars: number;
  progress: {
    total: number;
    level: { levelNo: number; name: string; frameColor: string };
    avatar: { name: string; svgPath: string } | null;
  };
};
type Criteria = { id: string; name: string; stars: number };
type Log = {
  id: string;
  studentName: string;
  criteriaName: string | null;
  stars: number;
  recordedAtLabel: string;
  isReversal: boolean;
  reversed: boolean;
};

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function StarPad({
  sessionId,
  students,
  criteria,
  logs,
  maxDeduction,
}: {
  sessionId: string;
  students: Student[];
  criteria: Criteria[];
  logs: Log[];
  maxDeduction: number;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState("");
  const [pending, startTransition] = useTransition();
  const allSelected = students.length > 0 && selected.size === students.length;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function award(c: Criteria) {
    startTransition(async () => {
      const result = await awardStarsAction({ sessionId, criteriaId: c.id, studentIds: [...selected], note });
      if (!result.ok) return void toast.error(result.error, { duration: 8000 });
      toast.success(`Đã ghi ${signed(c.stars)} sao (${c.name}) cho ${result.data.count} học viên.`);
      showLevelChanges(result.data);
      setPicking(false);
      setSelected(new Set());
      setNote("");
    });
  }

  function undo(log: Log) {
    if (!window.confirm(`Hoàn tác ${signed(log.stars)} sao của ${log.studentName}?`)) return;
    startTransition(async () => {
      const result = await undoStarAction({ logId: log.id });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Đã hoàn tác.");
      showLevelChanges(result.data);
    });
  }

  return (
    <div className="grid gap-4 pb-24">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Chạm để chọn từng em, một nhóm hoặc cả lớp.</p>
        <Button
          variant="outline"
          className="h-10 shrink-0"
          onClick={() => setSelected(allSelected ? new Set() : new Set(students.map((s) => s.studentId)))}
        >
          {allSelected ? "Bỏ chọn" : "Chọn cả lớp"}
        </Button>
      </div>

      <ul className="grid gap-2 sm:grid-cols-2">
        {students.map((s) => {
          const checked = selected.has(s.studentId);
          return (
            <li key={s.studentId}>
              <button
                type="button"
                role="checkbox"
                aria-checked={checked}
                aria-label={`Chọn ${s.fullName}`}
                onClick={() => toggle(s.studentId)}
                className={cn(
                  "flex w-full items-center gap-3 glass-solid rounded-xl border p-2.5 text-left transition-colors",
                  checked ? "border-primary bg-primary/10 ring-2 ring-primary" : "hover:bg-muted",
                )}
              >
                <AvatarBadge avatar={s.progress.avatar} frameColor={s.progress.level.frameColor} size={40} />
                <span className="grid min-w-0 flex-1">
                  <span className="font-medium break-words">{s.fullName}</span>
                  <span className="text-xs text-muted-foreground">
                    Cấp {s.progress.level.levelNo} · {s.progress.level.name}
                  </span>
                </span>
                <span className="grid shrink-0 justify-items-end text-sm">
                  <span className="inline-flex items-center gap-0.5 font-semibold tabular-nums text-amber-600">
                    <StarIcon className="size-3.5 fill-current" aria-hidden />
                    {s.progress.total}
                  </span>
                  {s.sessionStars !== 0 && (
                    <span className={cn("text-xs tabular-nums", s.sessionStars > 0 ? "text-emerald-600" : "text-red-600")}>
                      buổi này {signed(s.sessionStars)}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <section className="grid gap-2">
        <h2 className="font-medium">
          Sổ ghi sao của buổi <span className="text-sm font-normal text-muted-foreground">({logs.length})</span>
        </h2>
        {logs.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">Chưa ghi sao trong buổi này.</p>
        ) : (
          <ul className="grid gap-1.5">
            {logs.map((log) => (
              <li key={log.id} className={cn("flex items-center gap-2 glass-solid rounded-xl border px-3 py-2 text-sm", log.reversed && "opacity-60")}>
                <span className={cn("w-9 shrink-0 font-semibold tabular-nums", log.stars > 0 ? "text-emerald-600" : "text-red-600")}>
                  {signed(log.stars)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("font-medium", log.reversed && "line-through")}>{log.studentName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {log.isReversal ? "Hoàn tác: " : ""}
                    {log.criteriaName ?? "—"} · {log.recordedAtLabel}
                    {log.reversed && " · đã hoàn tác"}
                  </span>
                </span>
                {!log.isReversal && !log.reversed && (
                  <Button variant="ghost" size="icon-lg" aria-label={`Hoàn tác ${signed(log.stars)} sao của ${log.studentName}`} disabled={pending} onClick={() => undo(log)}>
                    <Undo2Icon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background/95 p-3 md:left-(--sidebar-w)">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">Đã chọn {selected.size} học viên</p>
          <Button className="h-11 px-5" disabled={selected.size === 0} onClick={() => setPicking(true)}>
            Ghi sao
          </Button>
        </div>
      </div>

      <Dialog open={picking} onOpenChange={setPicking}>
        <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Ghi sao cho {selected.size} học viên</DialogTitle>
            <DialogDescription>Mỗi học viên bị trừ tối đa {maxDeduction} sao trong một buổi.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            {criteria.map((c) => (
              <button
                key={c.id}
                type="button"
                disabled={pending}
                onClick={() => award(c)}
                className={cn(
                  "flex min-h-12 items-center justify-between gap-3 glass-solid rounded-xl border px-3 text-left text-sm font-medium transition-colors disabled:opacity-50",
                  c.stars > 0 ? "border-emerald-600/30 hover:bg-emerald-500/10" : "border-red-600/30 hover:bg-red-500/10",
                )}
              >
                {c.name}
                <span className={cn("shrink-0 font-bold tabular-nums", c.stars > 0 ? "text-emerald-600" : "text-red-600")}>
                  {signed(c.stars)} sao
                </span>
              </button>
            ))}
            {criteria.length === 0 && <p className="text-sm text-muted-foreground">Chưa có tiêu chí sao nào đang dùng.</p>}
            <Input
              value={note}
              maxLength={200}
              placeholder="Ghi chú (không bắt buộc)"
              aria-label="Ghi chú"
              className="h-11"
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
