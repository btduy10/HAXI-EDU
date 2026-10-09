import Link from "next/link";
import { SessionCard, type TimetableSession } from "@/components/timetable";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatTime } from "@/lib/format";

export function TodaySessions({
  sessions,
  hrefOf,
  today,
}: {
  sessions: TimetableSession[];
  hrefOf: (s: TimetableSession) => string;
  today: string;
}) {
  return (
    <section className="grid gap-2">
      <h2 className="font-medium">
        Buổi học hôm nay <span className="text-sm font-normal text-muted-foreground">({formatDate(today)})</span>
      </h2>
      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">Hôm nay không có buổi học.</p>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {sessions.map((s) => (
            <SessionCard key={s.id} session={s} href={hrefOf(s)} today={today} />
          ))}
        </div>
      )}
    </section>
  );
}

type Overdue = { id: string; date: string; startTime: string; endTime: string; classCode: string; className: string; locked: boolean };

export function OverdueSessions({ sessions, hrefOf }: { sessions: Overdue[]; hrefOf: (id: string) => string }) {
  return (
    <section className="grid gap-2">
      <h2 className="font-medium">
        Buổi quá hạn chưa điểm danh <span className="text-sm font-normal text-muted-foreground">({sessions.length})</span>
      </h2>
      {sessions.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">Không có buổi nào quá hạn.</p>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {sessions.map((s) => (
            <li key={s.id}>
              <Link href={hrefOf(s.id)} className="flex items-center justify-between gap-2 glass-solid rounded-xl border p-3 text-sm hover:bg-muted">
                <span className="min-w-0">
                  <span className="font-medium">{s.classCode}</span>{" "}
                  <span className="text-muted-foreground">
                    {formatDate(s.date)} · {formatTime(s.startTime)}–{formatTime(s.endTime)}
                  </span>
                </span>
                {s.locked ? <Badge variant="outline">Đã khóa</Badge> : <Badge variant="destructive">Cần điểm danh</Badge>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
