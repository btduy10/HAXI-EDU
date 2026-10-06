import Link from "next/link";
import { cn } from "@/lib/utils";

/** Chuyển nhanh giữa điểm danh và ghi sao của cùng một buổi học. */
export function SessionTabs({
  area,
  sessionId,
  active,
  show,
}: {
  /** Khu vực đang đứng: trang quản lý hay khu vực giảng dạy. */
  area: "admin" | "teacher";
  sessionId: string;
  active: "attendance" | "stars";
  /** Các tab người dùng được xem (theo phân quyền). */
  show: { attendance: boolean; stars: boolean };
}) {
  const role = area;
  const tabs = [
    {
      key: "attendance" as const,
      label: "Điểm danh",
      href: role === "admin" ? `/admin/attendance/${sessionId}` : `/teacher/sessions/${sessionId}/attendance`,
    },
    {
      key: "stars" as const,
      label: "Ghi sao",
      href: role === "admin" ? `/admin/sessions/${sessionId}/stars` : `/teacher/sessions/${sessionId}/stars`,
    },
  ].filter((t) => show[t.key]);
  if (tabs.length < 2) return null;
  return (
    <nav aria-label="Buổi học" className="grid grid-cols-2 rounded-lg border p-0.5 text-sm">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={active === t.key ? "page" : undefined}
          className={cn(
            "flex min-h-10 items-center justify-center rounded-md font-medium",
            active === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted",
          )}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
