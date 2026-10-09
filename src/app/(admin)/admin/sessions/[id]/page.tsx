import type { Metadata } from "next";
import { BackLink } from "@/components/back-link";
import { ConfirmButton, FormDialogButton } from "@/components/action-buttons";
import { SessionBadges } from "@/components/timetable";
import { LinkButton } from "@/components/link-button";
import { WEEKDAY_LABELS, isoWeekday } from "@/lib/dates";
import { formatDate, formatTime, todayIso } from "@/lib/format";
import {
  cancelSessionAction,
  deleteSessionAction,
  rescheduleSessionAction,
  restoreSessionAction,
  setSubstituteAction,
  updateSessionAction,
} from "@/server/actions/schedule";
import { orNotFound, uuidParam } from "@/server/page";
import { listRooms, listTeachers } from "@/server/services/catalog";
import { getSession } from "@/server/services/sessions";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Buổi học" };

export default async function SessionDetailPage({ params }: PageProps<"/admin/sessions/[id]">) {
  const { actor, role, can } = await requireMenu("timetable");
  const canEdit = can("edit");
  const id = uuidParam((await params).id);
  const session = await orNotFound(getSession(actor, id));
  const [teachers, rooms] = await Promise.all([listTeachers(actor), listRooms(actor)]);

  const teacherOptions = teachers.filter((t) => t.status === "active").map((t) => ({ value: t.id, label: `${t.code} – ${t.fullName}` }));
  const roomOptions = rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.capacity} chỗ)` }));
  const start = formatTime(session.startTime);
  const end = formatTime(session.endTime);
  const cancelled = session.status === "cancelled";
  // Lớp chỉ hiển thị trên Thời khóa biểu: không điểm danh, không ghi sao.
  const tracksStudents = !session.timetableOnly;

  const facts: [string, string][] = [
    ["Ngày", `${WEEKDAY_LABELS[isoWeekday(session.date)]}, ${formatDate(session.date)}`],
    ["Giờ học", `${start}–${end}${session.slotName ? ` (${session.slotName})` : ""}`],
    ["Phòng", session.roomName ?? "Chưa chọn"],
    ["Giáo viên chính", session.teacherName ?? "Chưa phân công"],
    ["Trợ giảng", session.assistantName ?? "Không có"],
    ...(session.substituteName ? ([["GV dạy thay", session.substituteName]] as [string, string][]) : []),
    ...(session.originalDate ? ([["Ngày gốc", formatDate(session.originalDate)]] as [string, string][]) : []),
    ...(session.content ? ([["Nội dung", session.content]] as [string, string][]) : []),
    ...(session.teacherRemark ? ([["Nhận xét của giáo viên", session.teacherRemark]] as [string, string][]) : []),
    ...(session.note ? ([["Ghi chú", session.note]] as [string, string][]) : []),
  ];

  return (
    <div className="grid max-w-3xl gap-4">
      <div className="grid gap-2">
        <BackLink href={`/admin/timetable?date=${session.date}`}>Thời khóa biểu</BackLink>
        <h1 className="text-xl font-semibold">
          Buổi học {session.classCode} – {session.className}
        </h1>
        <div className="flex flex-wrap gap-1">
          <SessionBadges session={session} today={todayIso()} />
        </div>
      </div>

      <dl className="grid gap-2 glass-solid rounded-xl border p-3 text-sm">
        {facts.map(([label, value]) => (
          <div key={label} className="flex gap-2">
            <dt className="w-28 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 break-words">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="flex flex-wrap gap-2">
        {!cancelled && tracksStudents && can("view", "attendance") && (
          <LinkButton className="h-10" href={`/admin/attendance/${id}`}>
            {session.attendanceCount > 0 ? "Xem / sửa điểm danh" : "Điểm danh"}
          </LinkButton>
        )}
        {!cancelled && tracksStudents && can("view", "stars") && (
          <LinkButton variant="outline" className="h-10" href={`/admin/sessions/${id}/stars`}>
            Ghi sao
          </LinkButton>
        )}
        {!cancelled && canEdit && (
          <FormDialogButton
            label="Sửa buổi này"
            variant="outline"
            title="Sửa riêng buổi này"
            description="Chỉ thay đổi buổi này (đổi GV chính, trợ giảng cho linh động). Ca học gốc, lịch mẫu và các buổi khác giữ nguyên."
            fields={[
              { name: "startTime", label: "Giờ bắt đầu", type: "time", required: true },
              { name: "endTime", label: "Giờ kết thúc", type: "time", required: true },
              { name: "roomId", label: "Phòng", type: "select", options: roomOptions },
              { name: "teacherId", label: "Giáo viên chính", type: "select", options: teacherOptions },
              { name: "assistantTeacherId", label: "Trợ giảng (nếu có)", type: "select", options: teacherOptions, hint: "Để trống = buổi này không có trợ giảng." },
              { name: "content", label: "Nội dung buổi học", type: "textarea" },
              { name: "note", label: "Ghi chú", type: "textarea" },
            ]}
            initial={{
              startTime: start,
              endTime: end,
              roomId: session.roomId ?? "",
              teacherId: session.teacherId ?? "",
              assistantTeacherId: session.assistantTeacherId ?? "",
              content: session.content ?? "",
              note: session.note ?? "",
            }}
            fixed={{ id }}
            action={updateSessionAction}
          />
        )}
        {session.status === "planned" && canEdit && (
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
        {!cancelled && canEdit && (
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
                options: teacherOptions.filter((t) => t.value !== session.teacherId && t.value !== session.assistantTeacherId),
              },
            ]}
            initial={{ substituteTeacherId: session.substituteTeacherId ?? "" }}
            fixed={{ id }}
            action={setSubstituteAction}
          />
        )}
        {session.status === "planned" && canEdit && (
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
        {cancelled && canEdit && (
          <ConfirmButton
            label="Khôi phục buổi"
            confirmText="Khôi phục buổi học đã hủy?"
            action={restoreSessionAction}
            input={{ id }}
            successMessage="Đã khôi phục buổi học."
          />
        )}
        {role === "admin" && session.classStatus === "open" && (
          <ConfirmButton
            label="Xóa buổi"
            variant="destructive"
            confirmText={
              session.attendanceCount > 0 || session.starLogCount > 0
                ? `Xóa hẳn buổi học này? Sẽ xóa luôn ${session.attendanceCount} lượt điểm danh và ${session.starLogCount} lần ghi sao của buổi; cấp và avatar của học viên được tính lại. Không hoàn tác được.`
                : "Xóa hẳn buổi học này khỏi thời khóa biểu? Không hoàn tác được."
            }
            action={deleteSessionAction}
            input={{ id }}
            successMessage="Đã xóa buổi học."
          />
        )}
        {session.classStatus === "open" && can("add") && (
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
