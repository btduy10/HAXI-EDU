"use client";

import type { ComponentProps } from "react";
import { selectClass } from "@/components/form-dialog";
import { cn } from "@/lib/utils";

/**
 * Ô chọn trong form lọc (GET): chọn xong là gửi form ngay, không cần bấm thêm nút "Xem".
 * `clearOnChange` = tên các ô cùng form cần xóa giá trị trước khi gửi (vd. đổi lớp thì bỏ khoảng ngày cũ).
 */
export function AutoSubmitSelect({
  className,
  clearOnChange,
  ...props
}: ComponentProps<"select"> & { clearOnChange?: string[] }) {
  return (
    <select
      {...props}
      className={cn(selectClass, className)}
      onChange={(event) => {
        const form = event.currentTarget.form;
        if (!form) return;
        for (const name of clearOnChange ?? []) {
          const field = form.elements.namedItem(name);
          if (field instanceof HTMLInputElement) field.value = "";
        }
        form.requestSubmit();
      }}
    />
  );
}
