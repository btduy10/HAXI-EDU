import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { selectClass } from "@/components/form-dialog";
import { MonthView, type TimetableSession, WeekView } from "@/components/timetable";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { addDays, addMonths, endOfMonth, parseIsoDate, startOfMonth, startOfWeek } from "@/lib/dates";
import { formatDate, todayIso } from "@/lib/format";
import type { Actor } from "@/server/guard";
import { listTeachers, listRooms, listTimeSlotsForGrid } from "@/server/services/catalog";
import { listClasses } from "@/server/services/classes";
import { listSessions } from "@/server/services/sessions";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f-]{36}$/i;
const uuidOrEmpty = (v: string) => (UUID.test(v) ? v : "");

/**
 * Thời khóa biểu dùng chung: Admin có bộ lọc GV/lớp/phòng; GV chỉ xem lịch của mình
 * (phạm vi do service `listSessions` quyết định, không phụ thuộc tham số trên URL).
 */
export async function TimetablePage({
  actor,
  params,
  basePath,
  title,
  sessionHref,
}: {
  actor: Actor;
  params: Params;
  basePath: string;
  title: string;
  sessionHref: (session: TimetableSession) => string;
}) {
  const admin = actor.role === "admin";
  const today = todayIso();
  const view = one(params.view) === "month" ? "month" : "week";
  const date = parseIsoDate(one(params.date), today);
  const filters = admin
    ? { teacherId: uuidOrEmpty(one(params.teacherId)), classId: uuidOrEmpty(one(params.classId)), roomId: uuidOrEmpty(one(params.roomId)) }
    : { teacherId: "", classId: "", roomId: "" };

  const range =
    view === "week"
      ? { from: startOfWeek(date), to: addDays(startOfWeek(date), 6) }
      : { from: startOfWeek(startOfMonth(date)), to: addDays(startOfWeek(endOfMonth(date)), 6) };

  const [sessions, slots, options] = await Promise.all([
    listSessions(actor, { ...range, ...filters, personal: !admin }),
    listTimeSlotsForGrid(),
    admin ? Promise.all([listTeachers(actor), listClasses(actor), listRooms(actor)]) : null,
  ]);

  const href = (next: { view?: string; date?: string }) => {
    const query = new URLSearchParams({ view: next.view ?? view, date: next.date ?? date });
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    return `${basePath}?${query}`;
  };
  const step = (dir: 1 | -1) => (view === "week" ? addDays(date, 7 * dir) : addMonths(date, dir));
  const heading =
    view === "week"
      ? `${formatDate(range.from)} – ${formatDate(addDays(range.from, 6))}`
      : `Tháng ${Number(date.slice(5, 7))}/${date.slice(0, 4)}`;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-lg font-semibold">{title}</h1>
        <div className="flex rounded-lg border p-0.5 text-sm">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              aria-current={view === v ? "page" : undefined}
              className={`rounded-md px-3 py-1.5 ${view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
            >
              {v === "week" ? "Tuần" : "Tháng"}
            </Link>
          ))}
        </div>
      </div>

      {options && (
        <form className="grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="view" value={view} />
          <input type="hidden" name="date" value={date} />
          <select name="teacherId" defaultValue={filters.teacherId} aria-label="Lọc theo giáo viên" className={selectClass}>
            <option value="">Tất cả giáo viên</option>
            {options[0].map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
          <select name="classId" defaultValue={filters.classId} aria-label="Lọc theo lớp" className={selectClass}>
            <option value="">Tất cả lớp</option>
            {options[1].map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} – {c.name}
              </option>
            ))}
          </select>
          <select name="roomId" defaultValue={filters.roomId} aria-label="Lọc theo phòng" className={selectClass}>
            <option value="">Tất cả phòng</option>
            {options[2].map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <Button type="submit" variant="outline" className="h-11">
            Lọc
          </Button>
        </form>
      )}

      <div className="flex items-center justify-between gap-2">
        <LinkButton variant="outline" size="icon-lg" aria-label="Trước" href={href({ date: step(-1) })}>
          <ChevronLeftIcon />
        </LinkButton>
        <div className="flex min-w-0 flex-col items-center text-sm">
          <span className="font-medium">{heading}</span>
          <Link href={href({ date: today })} className="text-muted-foreground underline-offset-2 hover:underline">
            Hôm nay
          </Link>
        </div>
        <LinkButton variant="outline" size="icon-lg" aria-label="Sau" href={href({ date: step(1) })}>
          <ChevronRightIcon />
        </LinkButton>
      </div>

      {view === "week" ? (
        <WeekView sessions={sessions} date={date} slots={slots} hrefOf={sessionHref} today={today} />
      ) : (
        <MonthView sessions={sessions} date={date} dayHref={(day) => href({ view: "week", date: day })} today={today} />
      )}
    </div>
  );
}
