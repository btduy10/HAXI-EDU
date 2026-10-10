"use client";

import { createContext, useContext, useState } from "react";
import { type FieldOption, FormDialog } from "@/components/form-dialog";
import { enrollStudentAction } from "@/server/actions/admin";

type Target = { classId: string; classCode: string; startDate: string };

const EnrollContext = createContext<((target: Target) => void) | null>(null);

/**
 * Bọc quanh bảng tổng quan Ghi danh: giữ một hộp thoại "ghi danh" dùng chung,
 * các hàng trống chỉ cần gọi mở với lớp của mình.
 */
export function RosterEnroll({
  students,
  activeByClass,
  today,
  children,
}: {
  /** Học viên có thể ghi danh (chưa nghỉ hẳn). */
  students: FieldOption[];
  /** Học viên đang học của từng lớp: không cho chọn lại. */
  activeByClass: Record<string, string[]>;
  today: string;
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<Target | null>(null);
  const taken = new Set(target ? activeByClass[target.classId] : []);

  return (
    <EnrollContext.Provider value={setTarget}>
      {children}
      {target && (
        <FormDialog
          open
          onOpenChange={(open) => !open && setTarget(null)}
          title={`Ghi danh vào ${target.classCode}`}
          fields={[
            { name: "studentId", label: "Học viên", type: "select", required: true, options: students.filter((s) => !taken.has(s.value)) },
            { name: "joinedAt", label: "Ngày vào lớp", type: "date", required: true },
          ]}
          initial={{ joinedAt: today < target.startDate ? target.startDate : today }}
          successMessage="Đã ghi danh."
          onSubmit={(values) => enrollStudentAction(target.classId, values)}
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
