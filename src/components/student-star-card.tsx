import { StarIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/** Thẻ học viên trong danh sách của lớp: tên, mã và tổng sao tích lũy. */
export function StudentStarCard({ fullName, code, total, href }: { fullName: string; code: string; total: number; href?: string }) {
  const body = (
    <>
      <p className="min-w-0 flex-1 font-medium break-words">
        {fullName} <span className="text-sm font-normal text-muted-foreground">{code}</span>
      </p>
      <span className="inline-flex shrink-0 items-center gap-0.5 font-semibold tabular-nums text-amber-600">
        <StarIcon className="size-3.5 fill-current" aria-hidden />
        {total}
        <span className="sr-only"> sao</span>
      </span>
    </>
  );
  const className = "flex min-h-12 items-center gap-3 glass-solid rounded-2xl border p-3";
  return href ? (
    <Link href={href} className={cn(className, "hover:bg-muted")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
