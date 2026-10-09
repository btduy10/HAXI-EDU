import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import type { ComponentProps } from "react";

/**
 * Liên kết quay lại ở đầu trang chi tiết: mũi tên to, khi rê chuột hoặc chọn bằng bàn phím thì hiện viền nổi như nút.
 * Ký tự "←" vẫn nằm trong tên đọc của liên kết (ẩn với mắt, thay bằng icon) nên tên liên kết không đổi.
 */
export function BackLink({ href, children }: Pick<ComponentProps<typeof Link>, "href" | "children">) {
  return (
    <Link
      href={href}
      // -ml-3 bù phần đệm trái để chữ vẫn thẳng hàng với tiêu đề bên dưới.
      className="group -ml-3 inline-flex min-h-9 w-fit max-w-full items-center gap-1.5 rounded-full border border-transparent px-3 text-sm font-medium text-muted-foreground transition-all outline-none hover:-translate-y-px hover:border-border hover:bg-white hover:text-foreground hover:shadow-[inset_0_1px_0_#fff,0_1px_2px_rgb(14_40_65/0.08),0_6px_14px_-8px_rgb(14_40_65/0.35)] focus-visible:border-ring focus-visible:bg-white focus-visible:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-0 active:shadow-none"
    >
      <ArrowLeftIcon aria-hidden className="size-5 shrink-0 transition-transform group-hover:-translate-x-0.5" />
      <span className="sr-only">←</span>
      <span className="min-w-0 break-words">{children}</span>
    </Link>
  );
}
