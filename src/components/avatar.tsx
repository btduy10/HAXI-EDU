import { LockIcon, StarIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type AvatarData = { name: string; svgPath: string } | null;

/** Avatar robot với khung viền màu theo cấp (đồng/bạc/vàng). Avatar khóa hiển thị mờ kèm ổ khóa. */
export function AvatarBadge({
  avatar,
  frameColor,
  size = 48,
  locked = false,
  className,
}: {
  avatar: AvatarData;
  frameColor: string;
  size?: number;
  locked?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 rounded-full bg-muted", className)}
      style={{ width: size, height: size, boxShadow: `0 0 0 3px ${frameColor}, 0 0 0 4px rgb(0 0 0 / 0.15)` }}
    >
      {avatar && (
        // eslint-disable-next-line @next/next/no-img-element -- SVG tĩnh trong public/avatars, không cần tối ưu ảnh
        <img
          src={avatar.svgPath}
          alt={`Avatar ${avatar.name}`}
          width={size}
          height={size}
          className={cn("rounded-full", locked && "opacity-35 grayscale")}
        />
      )}
      {locked && (
        <span className="absolute inset-0 flex items-center justify-center">
          <LockIcon className="size-1/3 text-foreground/70" aria-hidden />
        </span>
      )}
    </span>
  );
}

type ProgressData = {
  total: number;
  level: { levelNo: number; name: string; frameColor: string };
  next: { name: string } | null;
  starsToNext: number;
  percent: number;
};

/** Cấp, tổng sao và thanh tiến độ "còn X sao để lên cấp". */
export function LevelProgress({ progress, compact = false }: { progress: ProgressData; compact?: boolean }) {
  const label = progress.next ? `Còn ${progress.starsToNext} sao để lên ${progress.next.name}` : "Đã đạt cấp cao nhất";
  return (
    <div className="grid min-w-0 gap-1">
      <div className="flex flex-wrap items-center gap-x-2 text-sm">
        <span className="font-medium">
          Cấp {progress.level.levelNo} · {progress.level.name}
        </span>
        <span className="inline-flex items-center gap-0.5 tabular-nums text-amber-600">
          <StarIcon className="size-3.5 fill-current" aria-hidden />
          {progress.total}
          <span className="sr-only"> sao</span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        aria-label={label}
        className="h-2 overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full" style={{ width: `${progress.percent}%`, backgroundColor: progress.level.frameColor }} />
      </div>
      {!compact && <p className="text-xs text-muted-foreground">{label}</p>}
    </div>
  );
}

/** Thẻ học viên: avatar + cấp + tổng sao + tiến độ. */
export function StudentProgressCard({
  fullName,
  code,
  progress,
  href,
}: {
  fullName: string;
  code: string;
  progress: ProgressData & { avatar: AvatarData };
  href?: string;
}) {
  const body = (
    <>
      <AvatarBadge avatar={progress.avatar} frameColor={progress.level.frameColor} />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="font-medium break-words">
          {fullName} <span className="text-sm font-normal text-muted-foreground">{code}</span>
        </p>
        <LevelProgress progress={progress} />
      </div>
    </>
  );
  const className = "flex items-center gap-3 rounded-lg border p-3";
  return href ? (
    <Link href={href} className={cn(className, "hover:bg-muted")}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
