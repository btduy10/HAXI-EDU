import Link from "next/link";
import { AddSessionButton } from "@/components/manual-scheduler";
import { Badge } from "@/components/ui/badge";
import { type ShiftTone, shiftTone } from "@/domain/time-slots";
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
  /** Tên viết tắt của giáo viên (menu Giáo viên); có thì Thời khóa biểu hiện tên này thay họ tên cho gọn. */
  teacherShortName?: string | null;
  substituteShortName?: string | null;
  assistantShortName?: string | null;
  kind: "regular" | "makeup";
  status: "planned" | "done" | "cancelled";
  attendanceCount: number;
  /** Lớp học thêm (lớp ngoài, chỉ giữ phòng): không phải buổi học, không bấm vào được, không có điểm danh. */
  extra?: boolean;
};

type HrefOf = (session: TimetableSession) => string;

const STATUS_LABEL = { planned: "Chưa điểm danh", done: "Đã điểm danh", cancelled: "Đã hủy" } as const;

// Tên giáo viên hiển thị trên Thời khóa biểu: tên viết tắt nếu có, không thì họ tên.
const teacherOf = (s: TimetableSession) => s.teacherShortName || s.teacherName;
const substituteOf = (s: TimetableSession) => s.substituteShortName || s.substituteName;
const assistantOf = (s: TimetableSession) => s.assistantShortName || s.assistantName;

// Nền theo ca (Sáng → Chiều → Tối đậm dần): nền hàng của lưới tuần và nền thẻ buổi học trên điện thoại.
const TONE_ROW = ["bg-shift-1", "bg-shift-2", "bg-shift-3"] as const;
const TONE_CARD = ["", "[--glass-bg:var(--shift-2)]", "[--glass-bg:var(--shift-3)]"] as const;

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
export function SessionCard({
  session,
  href,
  today,
  tone,
}: {
  session: TimetableSession;
  href: string;
  today: string;
  /** Bậc nền theo ca của buổi (Thời khóa biểu theo ngày); bỏ trống thì thẻ giữ nền sáng. */
  tone?: ShiftTone;
}) {
  if (session.extra) {
    return (
      <div className="glass-chip glass-extra rounded-lg border border-dashed p-3 text-sm">
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
        {session.teacherName && <p className="text-muted-foreground">GV: {teacherOf(session)}</p>}
      </div>
    );
  }
  return (
    <Link
      href={href}
      data-tone={tone}
      className={cn(
        "block rounded-lg border p-3 text-sm",
        // Buổi đã hủy để phẳng, không bóng, cho lùi về sau.
        session.status === "cancelled" ? "opacity-60 hover:bg-muted" : "glass-chip glass-lift",
        tone !== undefined && TONE_CARD[tone],
      )}
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
        GV: {session.substituteName ? `${substituteOf(session)} (thay ${teacherOf(session) ?? "?"})` : (teacherOf(session) ?? "Chưa phân công")}
        {session.assistantName && ` · Trợ giảng: ${assistantOf(session)}`}
      </p>
    </Link>
  );
}

function SessionChip({ session, href }: { session: TimetableSession; href: string }) {
  if (session.extra) {
    return (
      <div
        title={`Lớp học thêm · ${session.className}`}
        className="glass-chip glass-extra min-w-0 overflow-hidden rounded-md border border-dashed px-1.5 py-1 text-xs leading-tight"
      >
        <span className="block truncate">
          <span className="font-medium tabular-nums">{formatTime(session.startTime)}</span> {session.classCode}
        </span>
        <span className="block truncate text-muted-foreground">
          Học thêm{session.teacherName && ` · ${teacherOf(session)}`}
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
        "block min-w-0 overflow-hidden rounded-md border px-1.5 py-1 text-xs leading-tight",
        session.status === "cancelled" ? "text-muted-foreground line-through hover:bg-muted" : "glass-chip glass-lift",
        session.status === "done" && "glass-done",
        session.kind === "makeup" && "border-dashed",
      )}
    >
      <span className="block truncate">
        <span className="font-medium tabular-nums">{formatTime(session.startTime)}</span> {session.classCode}
      </span>
      <span className="block truncate text-muted-foreground">
        {substituteOf(session) ?? teacherOf(session) ?? "—"}
        {session.assistantName && ` + ${assistantOf(session)}`}
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
  const toneBySlot = new Map(slots.map((s) => [s.id, shiftTone(s.name)]));
  // Buổi không gắn ca (học bù giờ tự do) nằm ở hàng "Khác".
  const rows = [
    ...slots.map((s) => ({
      key: s.id,
      label: s.name,
      hint: `${formatTime(s.defaultStart)}–${formatTime(s.defaultEnd)}`,
      tone: shiftTone(s.name),
    })),
    { key: "other", label: "Khác", hint: "", tone: shiftTone(null) },
  ];
  const rowOf = (s: TimetableSession) => (s.timeSlotId && toneBySlot.has(s.timeSlotId) ? s.timeSlotId : "other");
  const toneOf = (s: TimetableSession) => toneBySlot.get(s.timeSlotId ?? "") ?? shiftTone(null);
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
                items.map((s) => <SessionCard key={s.id} session={s} href={hrefOf(s)} today={today} tone={toneOf(s)} />)
              )}
              <AddSessionButton date={day} label={`Xếp buổi học ngày ${formatDate(day)}`} className="min-h-10 w-full" />
            </section>
          );
        })}
      </div>

      <div className="glass-panel hidden overflow-x-auto rounded-xl border md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="bg-linear-to-b from-white/80 to-muted">
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
                  <th data-tone={row.tone} className={cn("border-b p-2 text-left font-medium", TONE_ROW[row.tone])}>
                    {row.label}
                    <span className="block text-xs font-normal text-muted-foreground">{row.hint}</span>
                  </th>
                  {days.map((day) => (
                    <td
                      key={day}
                      // Cột hôm nay phủ sắc xanh ngọc lên trên nền của ca nên vẫn nhận ra ca.
                      className={cn("border-b border-l p-1", TONE_ROW[row.tone], day === today && "bg-linear-to-b from-primary/8 to-primary/8")}
                    >
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
    <div className="glass-panel overflow-hidden rounded-xl border">
      <div className="grid grid-cols-7 bg-linear-to-b from-white/80 to-muted text-center text-xs font-medium">
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
                  <span key={s.id} className={cn("glass-chip truncate rounded border px-1", s.status === "done" && "glass-done")}>
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
