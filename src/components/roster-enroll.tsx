"use client";

import { createContext, useContext, useState } from "react";
import { type Field, type FieldOption, FormDialog } from "@/components/form-dialog";
import { cn } from "@/lib/utils";
import { enrollNewStudentAction, enrollStudentAction } from "@/server/actions/admin";

type Target = { classId: string; classCode: string; startDate: string };
type Mode = "existing" | "new";

const EnrollContext = createContext<((target: Target) => void) | null>(null);

/**
 * Bọc quanh bảng tổng quan Ghi danh: giữ một hộp thoại "ghi danh" dùng chung,
 * các hàng trống chỉ cần gọi mở với lớp của mình. Hộp thoại có hai kiểu: chọn học viên có sẵn, hoặc nhập học viên mới.
 */
export function RosterEnroll({
  students,
  activeByClass,
  today,
  newStudentFields,
  children,
}: {
  /** Học viên có thể ghi danh (chưa nghỉ hẳn). */
  students: FieldOption[];
  /** Học viên đang học của từng lớp: không cho chọn lại. */
  activeByClass: Record<string, string[]>;
  today: string;
  /** Các ô của form học viên mới; không truyền (thiếu quyền Thêm học viên) thì chỉ ghi danh được học viên có sẵn. */
  newStudentFields?: Field[];
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const [mode, setMode] = useState<Mode>("existing");
  const taken = new Set(target ? activeByClass[target.classId] : []);
  const joinedAt: Field = { name: "joinedAt", label: "Ngày vào lớp", type: "date", required: true };
  const tabs: { key: Mode; label: string }[] = [
    { key: "existing", label: "Học viên có sẵn" },
    { key: "new", label: "Học viên mới" },
  ];

  return (
    <EnrollContext.Provider value={setTarget}>
      {children}
      {target && (
        <FormDialog
          // Đổi kiểu nhập thì dựng lại form với bộ ô nhập tương ứng.
          key={mode}
          open
          onOpenChange={(open) => {
            if (open) return;
            setTarget(null);
            setMode("existing");
          }}
          title={`Ghi danh vào ${target.classCode}`}
          header={
            newStudentFields && (
              <div role="tablist" aria-label="Kiểu ghi danh" className="grid grid-cols-2 gap-1 rounded-xl border p-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    role="tab"
                    aria-selected={mode === tab.key}
                    onClick={() => setMode(tab.key)}
                    className={cn(
                      "h-10 rounded-lg text-sm font-medium transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                      mode === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-secondary-foreground",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            )
          }
          fields={
            mode === "new" && newStudentFields
              ? [...newStudentFields, joinedAt]
              : [{ name: "studentId", label: "Học viên", type: "select", required: true, options: students.filter((s) => !taken.has(s.value)) }, joinedAt]
          }
          initial={{ joinedAt: today < target.startDate ? target.startDate : today }}
          successMessage="Đã ghi danh."
          onSubmit={(values) =>
            mode === "new" ? enrollNewStudentAction({ ...values, classId: target.classId }) : enrollStudentAction(target.classId, values)
          }
        />
      )}
    </EnrollContext.Provider>
  );
}

/**
 * Hàng trống của một lớp: bấm để thêm học viên. `seat` = chỗ trống thứ mấy của lớp ("Thêm 1 học viên", "Thêm 2 học viên"…).
 * Không hiển thị nếu không nằm trong RosterEnroll.
 */
export function AddStudentButton({ label, seat, ...target }: Target & { label: string; seat: number }) {
  const open = useContext(EnrollContext);
  if (!open) return null;
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => open(target)}
      className="flex h-8 w-full items-center rounded-md border border-dashed px-2 text-xs text-muted-foreground transition-colors md:h-6 hover:border-primary hover:bg-secondary hover:text-secondary-foreground focus-visible:border-primary focus-visible:outline-2"
    >
      Thêm {seat} học viên
    </button>
  );
}
