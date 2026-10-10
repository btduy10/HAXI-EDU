"use client";

import { createContext, useContext, useState } from "react";
import { type Field, FormDialog } from "@/components/form-dialog";
import { enrollNewStudentAction } from "@/server/actions/admin";

type Target = { classId: string; classCode: string; startDate: string };

const EnrollContext = createContext<((target: Target) => void) | null>(null);

/**
 * Bọc quanh bảng tổng quan Ghi danh: giữ một hộp thoại "ghi danh" dùng chung, các hàng trống chỉ cần gọi mở với lớp của mình.
 * Hộp thoại nhập học viên mới rồi ghi danh ngay vào lớp; học viên đã có trong hệ thống thì xếp ở mục Chờ lớp
 * hoặc ở danh sách chi tiết của lớp.
 */
export function RosterEnroll({
  today,
  newStudentFields,
  children,
}: {
  today: string;
  /** Các ô của form học viên mới (theo quyền xem thông tin cá nhân của người dùng). */
  newStudentFields: Field[];
  children: React.ReactNode;
}) {
  const [target, setTarget] = useState<Target | null>(null);

  return (
    <EnrollContext.Provider value={setTarget}>
      {children}
      {target && (
        <FormDialog
          open
          onOpenChange={(open) => !open && setTarget(null)}
          title={`Ghi danh vào ${target.classCode}`}
          description="Nhập thông tin học viên mới; em được ghi danh ngay vào lớp này."
          fields={[...newStudentFields, { name: "joinedAt", label: "Ngày vào lớp", type: "date", required: true }]}
          initial={{ joinedAt: today < target.startDate ? target.startDate : today }}
          successMessage="Đã ghi danh."
          onSubmit={(values) => enrollNewStudentAction({ ...values, classId: target.classId })}
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
