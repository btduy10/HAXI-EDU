import Link from "next/link";
import { SessionTabs } from "@/components/session-tabs";
import { StarPad } from "@/components/star-pad";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { WEEKDAY_LABELS, isoWeekday } from "@/lib/dates";
import { formatDate, formatDateTime, formatTime, todayIso } from "@/lib/format";
import { type Actor, can } from "@/server/guard";
import { orNotFound } from "@/server/page";
import { getSession } from "@/server/services/sessions";
import { getSessionStarBoard } from "@/server/services/stars";

/** Trang ghi sao của một buổi, dùng chung cho Admin và GV; quyền trên buổi do service kiểm tra. */
export async function StarsPage({
  actor,
  sessionId,
  backHref,
  area,
}: {
  actor: Actor;
  sessionId: string;
  backHref: string;
  area: "admin" | "teacher";
}) {
  const session = await orNotFound(getSession(actor, sessionId));
  const board = await getSessionStarBoard(actor, sessionId);
  const blocked =
    session.status === "cancelled" ? "Buổi đã hủy nên không ghi sao được." : session.date > todayIso() ? "Chưa đến ngày học." : null;

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div className="grid gap-1">
        <Link href={backHref} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← Quay lại
        </Link>
        <h1 className="text-lg font-semibold">
          Ghi sao {session.classCode} – {session.className}
        </h1>
        <p className="text-sm text-muted-foreground">
          {WEEKDAY_LABELS[isoWeekday(session.date)]}, {formatDate(session.date)} · {formatTime(session.startTime)}–
          {formatTime(session.endTime)}
        </p>
      </div>
      <SessionTabs area={area} sessionId={sessionId} active="stars" show={{ attendance: can(actor, "attendance", "view"), stars: true }} />

      {blocked ? (
        <Alert>
          <AlertDescription>{blocked}</AlertDescription>
        </Alert>
      ) : board.students.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Buổi học không có học viên nào.</p>
      ) : !can(actor, "stars", "add") ? (
        <>
          <Alert>
            <AlertDescription>Bạn chỉ có quyền xem sao của buổi này, không có quyền ghi sao.</AlertDescription>
          </Alert>
          <ul className="grid gap-1.5">
            {board.students.map((s) => (
              <li key={s.studentId} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                <span className="min-w-0 break-words">
                  {s.fullName} <span className="text-muted-foreground">({s.code})</span>
                </span>
                <span className="shrink-0 font-semibold tabular-nums">
                  {s.sessionStars > 0 ? `+${s.sessionStars}` : s.sessionStars} sao buổi này · tổng {s.progress.total}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <StarPad
          sessionId={sessionId}
          maxDeduction={board.maxDeduction}
          criteria={board.criteria.map((c) => ({ id: c.id, name: c.name, stars: c.stars }))}
          students={board.students.map((s) => ({
            studentId: s.studentId,
            code: s.code,
            fullName: s.fullName,
            sessionStars: s.sessionStars,
            progress: { total: s.progress.total, level: s.progress.level, avatar: s.progress.avatar },
          }))}
          logs={board.logs.map((l) => ({
            id: l.id,
            studentName: l.studentName,
            criteriaName: l.criteriaName,
            stars: l.stars,
            recordedAtLabel: formatDateTime(l.recordedAt),
            isReversal: l.isReversal,
            reversed: l.reversed,
          }))}
        />
      )}
    </div>
  );
}
