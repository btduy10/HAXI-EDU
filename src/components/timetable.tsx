import Link from "next/link";
import { AddSessionButton } from "@/components/manual-scheduler";
import { Badge } from "@/components/ui/badge";
import { WEEKDAY_LABELS, WEEKDAY_SHORT, addDays, eachDay, endOfMonth, isoWeekday, startOfMonth, startOfWeek } from "@/lib/dates";
import { formatDate, formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type TimetableSession = {
  id: string;
  classCode: string;
  className: string;
  date: string;
  originalDate: string | null;
  startTime: string;
  endTime: string;
  timeSlotId: string | null;
  roomName: string | null;
  teacherName: string | null;
  substituteName: string | null;
  assistantName: string | null;
  kind: "regular" | "makeup";
  status: "planned" | "done" | "cancelled";
  attendanceCount: number;
  /** Lớp học thêm (lớp ngoài, chỉ giữ phòng): không phải buổi học, không bấm vào được, không có điểm danh. */
  extra?: boolean;
};

type HrefOf = (session: TimetableSession) => string;

const STATUS_LABEL = { planned: "Chưa điểm danh", done: "Đã điểm danh", cancelled: "Đã hủy" } as const;

export function SessionBadges({ session, today }: { session: TimetableSession; today: string }) {
  if (session.extra) return <Badge variant="outline">Học thêm</Badge>;
  return (
    <>
      {session.kind === "makeup" && <Badge variant="outline">Học bù</Badge>}
      {session.substituteName && <Badge variant="outline">Dạy thay</Badge>}
      {session.originalDate && <Badge variant="outline">Dời từ {formatDate(session.originalDate).slice(0, 5)}</Badge>}
      {session.status === "cancelled" && <Badge variant="destructive">Đã hủy</Badge>}
      {session.status === "done" && <Badge variant="secondary">Đã điểm danh</Badge>}
      {session.status === "planned" && session.date < today && <Badge variant="destructive">Quá hạn</Badge>}
    </>
  );
}

/** Thẻ buổi học đầy đủ, dùng cho danh sách theo ngày (di động) và các bảng tổng hợp. */
export function SessionCard({ session, href, today }: { session: TimetableSession; href: string; today: string }) {
  if (session.extra) {
    return (
      <div className="rounded-lg border border-dashed border-amber-600/40 bg-amber-500/10 p-3 text-sm">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold tabular-nums">
            {formatTime(session.startTime)}–{formatTime(session.endTime)}
          </span>
          <span className="font-medium">{session.classCode}</span>
          <SessionBadges session={session} today={today} />
        </div>
        <p className="mt-1 text-muted-foreground">
          {session.className}
          {session.roomName && ` · ${session.roomName}`}
        </p>
        {session.teacherName && <p className="text-muted-foreground">GV: {session.teacherName}</p>}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={cn("block rounded-lg border p-3 text-sm hover:bg-muted", session.status === "cancelled" && "opacity-60")}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="font-semibold tabular-nums">
          {formatTime(session.startTime)}–{formatTime(session.endTime)}
        </span>
        <span className={cn("font-medium", session.status === "cancelled" && "line-through")}>{session.classCode}</span>
        <SessionBadges session={session} today={today} />
      </div>
      <p className="mt-1 text-muted-foreground">
        {session.className}
        {session.roomName && ` · ${session.roomName}`}
      </p>
      <p className="text-muted-foreground">
        GV: {session.substituteName ? `${session.substituteName} (thay ${session.teacherName ?? "?"})` : (session.teacherName ?? "Chưa phân công")}
        {session.assistantName && ` · Trợ giảng: ${session.assistantName}`}
      </p>
    </Link>
  );
}

function SessionChip({ session, href }: { session: TimetableSession; href: string }) {
  if (session.extra) {
    return (
      <div
        title={`Lớp học thêm · ${session.className}`}
        className="min-w-0 overflow-hidden rounded-md border border-dashed border-amber-600/40 bg-amber-500/10 px-1.5 py-1 text-xs leading-tight"
      >
        <span className="block truncate">
          <span className="font-medium tabular-nums">{formatTime(session.startTime)}</span> {session.classCode}
        </span>
        <span className="block truncate text-muted-foreground">
          Học thêm{session.teacherName && ` · ${session.teacherName}`}
          {session.roomName && ` · ${session.roomName}`}
        </span>
      </div>
    );
  }
  return (
    <Link
      href={href}
      title={`${session.className} · ${STATUS_LABEL[session.status]}`}
      className={cn(
        "block min-w-0 overflow-hidden rounded-md border px-1.5 py-1 text-xs leading-tight hover:bg-muted",
        session.status === "cancelled" && "text-muted-foreground line-through",
        session.status === "done" && "border-emerald-600/30 bg-emerald-500/10",
        session.kind === "makeup" && "border-dashed",
      )}
    >
      <span className="block truncate">
        <span className="font-medium tabular-nums">{formatTime(session.startTime)}</span> {session.classCode}
      </span>
      <span className="block truncate text-muted-foreground">
        {session.substituteName ?? session.teacherName ?? "—"}
        {session.assistantName && ` + ${session.assistantName}`}
        {session.roomName && ` · ${session.roomName}`}
      </span>
    </Link>
  );
}

/** Tuần: di động hiển thị theo ngày; màn hình rộng hiển thị lưới thứ × ca. */
export function WeekView({
  sessions,
  date,
  slots,
  hrefOf,
  today,
}: {
  sessions: TimetableSession[];
  date: string;
  slots: { id: string; name: string; defaultStart: string; defaultEnd: string }[];
  hrefOf: HrefOf;
  today: string;
}) {
  const weekStart = startOfWeek(date);
  const days = [...eachDay(weekStart, addDays(weekStart, 6))];
  const slotIds = new Set(slots.map((s) => s.id));
  // Buổi không gắn ca (học bù giờ tự do) nằm ở hàng "Khác".
  const rows = [
    ...slots.map((s) => ({ key: s.id, label: s.name, hint: `${formatTime(s.defaultStart)}–${formatTime(s.defaultEnd)}` })),
    { key: "other", label: "Khác", hint: "" },
  ];
  const rowOf = (s: TimetableSession) => (s.timeSlotId && slotIds.has(s.timeSlotId) ? s.timeSlotId : "other");
  const hasOther = sessions.some((s) => rowOf(s) === "other");

  return (
    <>
      <div className="grid gap-3 md:hidden">
        {days.map((day) => {
          const items = sessions.filter((s) => s.date === day);
          return (
            <section key={day} className="grid gap-2">
              <h3 className={cn("text-sm font-medium", day === today && "text-primary underline underline-offset-4")}>
                {WEEKDAY_LABELS[isoWeekday(day)]}, {formatDate(day)}
              </h3>
              {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">Không có buổi học.</p>
              ) : (
                items.map((s) => <SessionCard key={s.id} session={s} href={hrefOf(s)} today={today} />)
              )}
              <AddSessionButton date={day} label={`Xếp buổi học ngày ${formatDate(day)}`} className="min-h-10 w-full" />
            </section>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="w-24 border-b p-2 text-left font-medium">Ca</th>
              {days.map((day) => (
                <th key={day} className={cn("border-b border-l p-2 text-left font-medium", day === today && "bg-primary/10")}>
                  {WEEKDAY_SHORT[isoWeekday(day)]} <span className="font-normal text-muted-foreground">{formatDate(day).slice(0, 5)}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows
              .filter((r) => r.key !== "other" || hasOther)
              .map((row) => (
                <tr key={row.key} className="align-top">
                  <th className="border-b p-2 text-left font-medium">
                    {row.label}
                    <span className="block text-xs font-normal text-muted-foreground">{row.hint}</span>
                  </th>
                  {days.map((day) => (
                    <td key={day} className={cn("border-b border-l p-1", day === today && "bg-primary/5")}>
                      <div className="grid grid-cols-1 gap-1">
                        {sessions
                          .filter((s) => s.date === day && rowOf(s) === row.key)
                          .map((s) => (
                            <SessionChip key={s.id} session={s} href={hrefOf(s)} />
                          ))}
                        {row.key !== "other" && (
                          <AddSessionButton
                            date={day}
                            slotId={row.key}
                            label={`Xếp buổi học ${WEEKDAY_SHORT[isoWeekday(day)]} ${formatDate(day).slice(0, 5)}, ${row.label}`}
                            className="min-h-7 w-full opacity-60 hover:opacity-100 focus-visible:opacity-100"
                          />
                        )}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Lịch tháng: mỗi ô là một ngày; bấm vào ngày để mở tuần chứa ngày đó. */
export function MonthView({
  sessions,
  date,
  dayHref,
  today,
}: {
  sessions: TimetableSession[];
  date: string;
  dayHref: (day: string) => string;
  today: string;
}) {
  const first = startOfMonth(date);
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(endOfMonth(date)), 6);
  const days = [...eachDay(gridStart, gridEnd)];
  const month = date.slice(0, 7);

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 bg-muted/50 text-center text-xs font-medium">
        {[1, 2, 3, 4, 5, 6, 7].map((d) => (
          <div key={d} className="p-1.5">
            {WEEKDAY_SHORT[d]}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const items = sessions.filter((s) => s.date === day && s.status !== "cancelled");
          return (
            <Link
              key={day}
              href={dayHref(day)}
              aria-label={`${formatDate(day)}: ${items.length} buổi học`}
              className={cn(
                "flex min-h-14 flex-col gap-0.5 border-t border-l p-1 text-xs first:border-l-0 hover:bg-muted md:min-h-24",
                !day.startsWith(month) && "bg-muted/30 text-muted-foreground",
                day === today && "bg-primary/10",
              )}
            >
              <span className={cn("tabular-nums", day === today && "font-bold")}>{Number(day.slice(8))}</span>
              {items.length > 0 && (
                <span className="w-fit rounded-full bg-primary px-1.5 text-[10px] font-medium text-primary-foreground md:hidden">
                  {items.length}
                </span>
              )}
              <span className="hidden gap-0.5 md:grid">
                {items.slice(0, 3).map((s) => (
                  <span key={s.id} className={cn("truncate rounded bg-muted px-1", s.status === "done" && "bg-emerald-500/15")}>
                    {formatTime(s.startTime)} {s.classCode}
                  </span>
                ))}
                {items.length > 3 && <span className="text-muted-foreground">+{items.length - 3} buổi</span>}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
