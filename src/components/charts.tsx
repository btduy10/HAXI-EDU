import { cn } from "@/lib/utils";

// Biểu đồ vẽ bằng HTML/SVG thuần (không dùng thư viện), render ở máy chủ.
// Quy ước: chữ luôn dùng màu chữ của giao diện; màu dữ liệu chỉ nằm trên cột/miếng.

/** Màu phân loại cho 5 trạng thái điểm danh. Thứ tự này đã qua kiểm tra phân biệt màu (kể cả mù màu). */
export const ATTENDANCE_SERIES = [
  { key: "present", label: "Có mặt", color: "#1baf7a" },
  { key: "excused", label: "Vắng có phép", color: "#2a78d6" },
  { key: "late", label: "Đi trễ", color: "#eda100" },
  { key: "left_early", label: "Về sớm", color: "#4a3aa7" },
  { key: "absent", label: "Vắng không phép", color: "#e34948" },
] as const;

const formatNumber = (n: number) => new Intl.NumberFormat("vi-VN").format(n);

export function ChartCard({
  title,
  subtitle,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("grid content-start gap-3 rounded-xl border bg-card p-4", className)}>
      <div>
        <h2 className="text-base">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Empty({ text = "Chưa có dữ liệu." }: { text?: string }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</p>;
}

/** Khung chú thích hiện khi rê chuột hoặc chạm/tab vào một cột. */
function Tip({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      role="tooltip"
      className={cn(
        "pointer-events-none absolute z-10 hidden w-max max-w-56 rounded-md border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md group-hover:block group-focus-visible:block",
        className,
      )}
    >
      {children}
    </span>
  );
}

export type BarDatum = { key: string; label: string; value: number; display?: string; detail?: string; color?: string };

/** Biểu đồ cột ngang: so sánh độ lớn giữa các mục, giá trị ghi ở đầu cột. */
export function BarList({ data, max, emptyText }: { data: BarDatum[]; max?: number; emptyText?: string }) {
  if (data.length === 0) return <Empty text={emptyText} />;
  const top = Math.max(max ?? 0, ...data.map((d) => d.value), 1);
  return (
    <ul className="grid gap-2">
      {data.map((d) => (
        <li key={d.key} tabIndex={0} className="group relative grid grid-cols-[minmax(0,7.5rem)_1fr_auto] items-center gap-2 rounded-sm text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,11rem)_1fr_auto]">
          <span className="truncate">{d.label}</span>
          <span className="flex h-3.5 items-center border-l border-border">
            <span
              className="h-full min-w-0.5 rounded-r-sm bg-primary transition-opacity group-hover:opacity-80"
              style={{ width: `${Math.max(0, (d.value / top) * 100)}%`, ...(d.color ? { backgroundColor: d.color } : {}) }}
            />
          </span>
          <span className="w-12 text-right tabular-nums">{d.display ?? formatNumber(d.value)}</span>
          <Tip className="top-full left-0 mt-1">
            <strong>{d.label}</strong>: {d.display ?? formatNumber(d.value)}
            {d.detail && <span className="block text-muted-foreground">{d.detail}</span>}
          </Tip>
        </li>
      ))}
    </ul>
  );
}

/** Bước chia trục tròn số (1, 2, 5 × 10ⁿ) để có khoảng 4 vạch. */
function niceMax(value: number): { max: number; step: number } {
  if (value <= 0) return { max: 4, step: 1 };
  const rough = value / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow;
  const nice = Math.max(1, Math.ceil(step));
  return { max: Math.ceil(value / nice) * nice, step: nice };
}

export type ColumnDatum = { key: string; label: string; value: number; detail?: string };

/** Biểu đồ cột đứng cho chuỗi theo thời gian (vd. theo tuần). Giá trị âm hiển thị ở mức 0. */
export function ColumnChart({ data, unit, emptyText }: { data: ColumnDatum[]; unit: string; emptyText?: string }) {
  if (data.every((d) => d.value === 0)) return <Empty text={emptyText} />;
  const { max, step } = niceMax(Math.max(...data.map((d) => d.value)));
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => max - i * step);
  return (
    <div className="grid grid-cols-[auto_1fr] gap-x-2 text-xs">
      <div className="flex h-40 flex-col justify-between text-right tabular-nums text-muted-foreground" aria-hidden>
        {ticks.map((t) => (
          <span key={t} className="-translate-y-1/2 leading-none first:translate-y-0 last:translate-y-0">
            {formatNumber(t)}
          </span>
        ))}
      </div>
      <div className="relative h-40">
        <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
          {ticks.map((t) => (
            <span key={t} className={cn("h-px w-full", t === 0 ? "bg-muted-foreground/50" : "bg-border")} />
          ))}
        </div>
        <ul className="absolute inset-0 flex items-end justify-around gap-1">
          {data.map((d) => (
            <li key={d.key} tabIndex={0} className="group relative flex h-full flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <span
                className="w-full max-w-6 rounded-t-sm bg-primary transition-opacity group-hover:opacity-80"
                style={{ height: `${(Math.max(0, d.value) / max) * 100}%` }}
              />
              <Tip className="bottom-full left-1/2 mb-1 -translate-x-1/2">
                <strong>{d.label}</strong>: {formatNumber(d.value)} {unit}
                {d.detail && <span className="block text-muted-foreground">{d.detail}</span>}
              </Tip>
            </li>
          ))}
        </ul>
      </div>
      <span />
      <ul className="mt-1 flex justify-around gap-1 text-center text-muted-foreground">
        {data.map((d) => (
          <li key={d.key} className="flex-1 truncate">
            {d.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export type DonutDatum = { key: string; label: string; value: number; color: string };

/**
 * Biểu đồ tròn (vành khuyên) cho cơ cấu thành phần. Luôn kèm chú giải có số lượng và tỷ lệ,
 * nên không ai phải dựa riêng vào màu để đọc.
 */
export function DonutChart({
  data,
  centerValue,
  centerLabel,
  unit,
  emptyText,
}: {
  data: DonutDatum[];
  centerValue: string;
  centerLabel: string;
  unit: string;
  emptyText?: string;
}) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return <Empty text={emptyText} />;
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  // Khe hở 2px giữa các miếng (đơn vị viewBox 120 ≈ 160px hiển thị).
  const gap = data.filter((d) => d.value > 0).length > 1 ? 1.6 : 0;
  const visible = data.filter((d) => d.value > 0);
  const arcs = visible.map((d, index) => {
    const before = visible.slice(0, index).reduce((sum, p) => sum + p.value, 0);
    const length = (d.value / total) * circumference;
    return { ...d, dash: Math.max(0.5, length - gap), start: (before / total) * circumference };
  });
  const percent = (value: number) => `${Math.round((value / total) * 1000) / 10}%`;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative size-40 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={`${centerLabel}: ${centerValue}`}>
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={a.color}
              strokeWidth="16"
              strokeDasharray={`${a.dash} ${circumference - a.dash}`}
              strokeDashoffset={-a.start}
              className="transition-opacity hover:opacity-75"
            >
              <title>{`${a.label}: ${formatNumber(a.value)} ${unit} (${percent(a.value)})`}</title>
            </circle>
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl leading-none font-bold">{centerValue}</span>
          <span className="mt-1 max-w-20 text-xs leading-tight text-muted-foreground">{centerLabel}</span>
        </div>
      </div>
      <ul className="grid w-full min-w-0 gap-1.5 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center gap-2">
            <span aria-hidden className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: d.color }} />
            <span className="min-w-0 flex-1 truncate">{d.label}</span>
            <span className="tabular-nums">{formatNumber(d.value)}</span>
            <span className="w-12 text-right tabular-nums text-muted-foreground">{percent(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Biểu đồ tròn cơ cấu điểm danh, dùng chung cho Tổng quan và Báo cáo lớp. */
export function AttendanceDonut({
  counts,
  emptyText,
}: {
  counts: { present: number; late: number; left_early: number; excused: number; absent: number };
  emptyText?: string;
}) {
  const total = counts.present + counts.late + counts.left_early + counts.excused + counts.absent;
  const attended = counts.present + counts.late + counts.left_early;
  return (
    <DonutChart
      data={ATTENDANCE_SERIES.map((s) => ({ key: s.key, label: s.label, color: s.color, value: counts[s.key] }))}
      centerValue={total === 0 ? "–" : `${Math.round((attended / total) * 100)}%`}
      centerLabel="có đi học"
      unit="lượt"
      emptyText={emptyText}
    />
  );
}
