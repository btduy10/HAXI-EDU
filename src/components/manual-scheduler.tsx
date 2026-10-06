"use client";

import { PlusIcon } from "lucide-react";
import { createContext, useContext, useState } from "react";
import { type Field, type FieldOption, FormDialog } from "@/components/form-dialog";
import { WEEKDAY_LABELS, isoWeekday } from "@/lib/dates";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { createManualSessionAction } from "@/server/actions/schedule";

type Target = { date: string; slotId: string | null };
type Options = { slots: FieldOption[]; classes: FieldOption[]; teachers: FieldOption[]; rooms: FieldOption[] };

const SchedulerContext = createContext<((target: Target) => void) | null>(null);

/**
 * Bọc quanh lưới thời khóa biểu của Admin: giữ một hộp thoại "xếp buổi học" dùng chung,
 * các ô trong lưới chỉ cần gọi mở với ngày và ca của mình.
 */
export function ManualScheduler({
  options,
  defaults,
  children,
}: {
  options: Options;
  /** Giá trị điền sẵn khi Thời khóa biểu đang lọc theo lớp / giáo viên / phòng. */
  defaults?: { classId?: string; teacherId?: string; roomId?: string };
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<Target | null>(null);

  const fields: Field[] = [
    ...(target && !target.slotId
      ? ([{ name: "timeSlotId", label: "Ca học", type: "select", required: true, options: options.slots }] as Field[])
      : []),
    { name: "classId", label: "Lớp", type: "select", required: true, options: options.classes },
    { name: "teacherId", label: "Giáo viên", type: "select", options: options.teachers, hint: "Không chọn = giáo viên chính của lớp." },
    { name: "roomId", label: "Phòng", type: "select", options: options.rooms, hint: "Không chọn = phòng mặc định của lớp." },
  ];
  const slotLabel = target?.slotId ? options.slots.find((s) => s.value === target.slotId)?.label : null;

  return (
    <SchedulerContext.Provider value={setTarget}>
      {children}
      {target && (
        <FormDialog
          open
          onOpenChange={(open) => !open && setTarget(null)}
          title="Xếp buổi học"
          description={`${WEEKDAY_LABELS[isoWeekday(target.date)]}, ${formatDate(target.date)}${slotLabel ? ` · ${slotLabel}` : ""}`}
          fields={fields}
          initial={Object.fromEntries(Object.entries(defaults ?? {}).filter(([, v]) => v))}
          submitLabel="Xếp vào lịch"
          successMessage="Đã xếp buổi học."
          onSubmit={(values) =>
            createManualSessionAction({ ...values, date: target.date, ...(target.slotId ? { timeSlotId: target.slotId } : {}) })
          }
        />
      )}
    </SchedulerContext.Provider>
  );
}

/** Nút "+" trong một ô (ngày × ca) hoặc dưới một ngày. Không hiển thị nếu không nằm trong ManualScheduler. */
export function AddSessionButton({ date, slotId = null, label, className }: { date: string; slotId?: string | null; label: string; className?: string }) {
  const open = useContext(SchedulerContext);
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => open({ date, slotId })}
      className={cn(
        "flex items-center justify-center gap-1 rounded-md border border-dashed text-xs text-muted-foreground transition-colors hover:border-primary hover:bg-secondary hover:text-secondary-foreground focus-visible:border-primary focus-visible:outline-2",
        className,
      )}
    >
      <PlusIcon className="size-3.5" aria-hidden />
      {slotId ? null : "Xếp buổi học"}
    </button>
  );
}
