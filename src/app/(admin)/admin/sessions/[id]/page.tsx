import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton, FormDialogButton } from "@/components/action-buttons";
import { SessionBadges } from "@/components/timetable";
import { LinkButton } from "@/components/link-button";
import { WEEKDAY_LABELS, isoWeekday } from "@/lib/dates";
import { formatDate, formatTime, todayIso } from "@/lib/format";
import {
  cancelSessionAction,
  rescheduleSessionAction,
  restoreSessionAction,
  setSubstituteAction,
  updateSessionAction,
} from "@/server/actions/schedule";
import { orNotFound, uuidParam } from "@/server/page";
import { listRooms, listTeachers } from "@/server/services/catalog";
import { getSession } from "@/server/services/sessions";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Buổi học" };

export default async function SessionDetailPage({ params }: PageProps<"/admin/sessions/[id]">) {
  const { actor } = await requirePageUser("admin");
  const id = uuidParam((await params).id);
  const session = await orNotFound(getSession(actor, id));
  const [teachers, rooms] = await Promise.all([listTeachers(actor), listRooms(actor)]);

  const teacherOptions = teachers.filter((t) => t.status === "active").map((t) => ({ value: t.id, label: `${t.code} – ${t.fullName}` }));
  const roomOptions = rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.capacity} chỗ)` }));
  const start = formatTime(session.startTime);
  const end = formatTime(session.endTime);
  const cancelled = session.status === "cancelled";

  const facts: [string, string][] = [
    ["Ngày", `${WEEKDAY_LABELS[isoWeekday(session.date)]}, ${formatDate(session.date)}`],
    ["Giờ học", `${start}–${end}${session.slotName ? ` (${session.slotName})` : ""}`],
    ["Phòng", session.roomName ?? "Chưa chọn"],
    ["Giáo viên", session.teacherName ?? "Chưa phân công"],
    ...(session.substituteName ? ([["GV dạy thay", session.substituteName]] as [string, string][]) : []),
    ...(session.originalDate ? ([["Ngày gốc", formatDate(session.originalDate)]] as [string, string][]) : []),
    ...(session.content ? ([["Nội dung", session.content]] as [string, string][]) : []),
    ...(session.note ? ([["Ghi chú", session.note]] as [string, string][]) : []),
  ];

  return (
    <div className="grid max-w-3xl gap-4">
      <div className="grid gap-2">
        <Link href={`/admin/timetable?date=${session.date}`} className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← Thời khóa biểu
        </Link>
        <h1 className="text-xl font-semibold">
          Buổi học {session.classCode} – {session.className}
        </h1>
        <div className="flex flex-wrap gap-1">
          <SessionBadges session={session} today={todayIso()} />
        </div>
      </div>

      <dl className="grid gap-2 rounded-lg border p-3 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        {!cancelled && (
          <LinkButton className="h-10" href={`/admin/attendance/${id}`}>
            {session.attendanceCount > 0 ? "Xem / sửa điểm danh" : "Điểm danh"}
          </LinkButton>
        )}
        {!cancelled && (
          <FormDialogButton
            label="Sửa buổi này"
            variant="outline"
            title="Sửa riêng buổi này"
            description="Chỉ thay đổi buổi này. Ca học gốc và các buổi khác giữ nguyên."
            fields={[
              { name: "startTime", label: "Giờ bắt đầu", type: "time", required: true },
              { name: "endTime", label: "Giờ kết thúc", type: "time", required: true },
              { name: "roomId", label: "Phòng", type: "select", options: roomOptions },
              { name: "teacherId", label: "Giáo viên", type: "select", options: teacherOptions },
              { name: "content", label: "Nội dung buổi học", type: "textarea" },
              { name: "note", label: "Ghi chú", type: "textarea" },
            ]}
            initial={{
              startTime: start,
              endTime: end,
              roomId: session.roomId ?? "",
              teacherId: session.teacherId ?? "",
              content: session.content ?? "",
              note: session.note ?? "",
            }}
            fixed={{ id }}
            action={updateSessionAction}
          />
        )}
        {session.status === "planned" && (
          <FormDialogButton
            label="Dời buổi"
            variant="outline"
            title="Dời buổi học"
            fields={[
              { name: "date", label: "Ngày mới", type: "date", required: true },
              { name: "startTime", label: "Giờ bắt đầu", type: "time", required: true },
              { name: "endTime", label: "Giờ kết thúc", type: "time", required: true },
            ]}
            initial={{ date: session.date, startTime: start, endTime: end }}
            fixed={{ id }}
            action={rescheduleSessionAction}
            successMessage="Đã dời buổi học."
          />
        )}
        {!cancelled && (
          <FormDialogButton
            label="GV dạy thay"
            variant="outline"
            title="Phân công GV dạy thay"
            description="GV gốc của buổi được giữ nguyên. Để trống để bỏ dạy thay."
            fields={[
              {
                name: "substituteTeacherId",
                label: "GV dạy thay",
                type: "select",
                options: teacherOptions.filter((t) => t.value !== session.teacherId),
              },
            ]}
            initial={{ substituteTeacherId: session.substituteTeacherId ?? "" }}
            fixed={{ id }}
            action={setSubstituteAction}
          />
        )}
        {session.status === "planned" && (
          <FormDialogButton
            label="Hủy buổi"
            variant="destructive"
            title="Hủy buổi học"
            description="Buổi đã hủy không cần điểm danh và không tính vào chuyên cần."
            fields={[{ name: "note", label: "Lý do", type: "textarea" }]}
            initial={{ note: session.note ?? "" }}
            fixed={{ id }}
            action={cancelSessionAction}
            submitLabel="Hủy buổi"
            successMessage="Đã hủy buổi học."
          />
        )}
        {cancelled && (
          <ConfirmButton
            label="Khôi phục buổi"
            confirmText="Khôi phục buổi học đã hủy?"
            action={restoreSessionAction}
            input={{ id }}
            successMessage="Đã khôi phục buổi học."
          />
        )}
        {session.classStatus === "open" && (
          <LinkButton
            variant="outline"
            className="h-10" href={`/admin/sessions/makeup?classId=${session.classId}`}>
            Thêm buổi bù
          </LinkButton>
        )}
      </div>
    </div>
  );
}
