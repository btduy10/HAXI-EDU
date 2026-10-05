"use client";

import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Ô nhập mật khẩu có nút con mắt: NHẤN GIỮ (chuột, chạm, hoặc phím Space/Enter) để xem mật khẩu đã nhập,
 * thả ra là ẩn lại ngay, nên mật khẩu không bị để lộ trên màn hình.
 */
export function PasswordInput({ className, ...props }: Omit<React.ComponentProps<typeof Input>, "type">) {
  const [visible, setVisible] = useState(false);
  const show = () => setVisible(true);
  const hide = () => setVisible(false);
  const isHoldKey = (event: React.KeyboardEvent) => event.key === " " || event.key === "Enter";

  return (
    <div className="relative">
      <Input {...props} type={visible ? "text" : "password"} className={cn("pr-12", className)} />
      <button
        type="button"
        aria-label="Nhấn giữ để xem nội dung đã nhập"
        title="Nhấn giữ để xem"
        aria-pressed={visible}
        onPointerDown={(event) => {
          event.preventDefault(); // giữ con trỏ nhập ở ô mật khẩu
          show();
        }}
        onPointerUp={hide}
        onPointerLeave={hide}
        onPointerCancel={hide}
        onKeyDown={(event) => {
          if (isHoldKey(event)) {
            event.preventDefault(); // không gửi form khi giữ Enter
            show();
          }
        }}
        onKeyUp={hide}
        onBlur={hide}
        onContextMenu={(event) => event.preventDefault()}
        className="absolute inset-y-0 right-0 flex w-11 touch-none items-center justify-center rounded-r-lg text-muted-foreground outline-none select-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {visible ? <EyeIcon className="size-5" aria-hidden /> : <EyeOffIcon className="size-5" aria-hidden />}
      </button>
    </div>
  );
}
