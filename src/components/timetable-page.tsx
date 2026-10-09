import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { CrudSection } from "@/components/crud-section";
import { type Field, selectClass } from "@/components/form-dialog";
import { ManualScheduler } from "@/components/manual-scheduler";
import { TimetableExport } from "@/components/timetable-export";
import { MonthView, TeacherLegend, type TimetableSession, WeekView, leadTeacherId } from "@/components/timetable";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { orderSlotFrames } from "@/domain/time-slots";
import { EXTRA_SHADE, teacherShade } from "@/domain/timetable-colors";
import { WEEKDAY_LABELS, addDays, addMonths, endOfMonth, parseIsoDate, startOfMonth, startOfWeek } from "@/lib/dates";
import { formatDate, formatTime, todayIso } from "@/lib/format";
import { SLOT_NAME_LABELS } from "@/lib/validation/entities";
import { createExtraClassAction, deleteExtraClassAction, updateExtraClassAction } from "@/server/actions/admin";
import type { Actor } from "@/server/guard";
import { listCourses, listRooms, listTeachers, listTimeSlots, listTimeSlotsForGrid } from "@/server/services/catalog";
import { listClasses } from "@/server/services/classes";
import { extraClassesForRange, listExtraClasses } from "@/server/services/extra-classes";
import { listSessions } from "@/server/services/sessions";

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f-]{36}$/i;
const uuidOrEmpty = (v: string) => (UUID.test(v) ? v : "");

/**
 * Thời khóa biểu dùng chung. `manage` = trang quản lý (có bộ lọc GV/lớp/phòng); không thì là lịch cá nhân.
 * Phạm vi buổi học do service `listSessions` quyết định, không phụ thuộc tham số trên URL.
 */
export async function TimetablePage({
  actor,
  params,
  basePath,
  title,
  sessionHref,
  manage = false,
  canAdd = false,
  canEdit = false,
  canDelete = false,
}: {
  /** Trang quản lý Thời khóa biểu (menu được phân quyền), có bộ lọc và bảng Lớp học thêm. */
  manage?: boolean;
  /** Được xếp tay buổi học và thêm lớp học thêm (quyền Thêm của menu Thời khóa biểu). */
  canAdd?: boolean;
  /** Được sửa lớp học thêm (quyền Sửa của menu Thời khóa biểu). */
  canEdit?: boolean;
  /** Được xóa lớp học thêm (chỉ Admin). */
  canDelete?: boolean;
  actor: Actor;
  params: Params;
  basePath: string;
  title: string;
  sessionHref: (session: TimetableSession) => string;
}) {
  const admin = manage;
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

  const [lessons, extras, slots, teacherList, options] = await Promise.all([
    listSessions(actor, { ...range, ...filters, personal: !admin }),
    // Lớp học thêm (giữ phòng hằng tuần): ẩn khi đang lọc theo một lớp cụ thể.
    filters.classId ? [] : extraClassesForRange(actor, { ...range, teacherId: filters.teacherId, roomId: filters.roomId, personal: !admin }),
    listTimeSlotsForGrid(),
    listTeachers(actor),
    admin ? Promise.all([listClasses(actor), listRooms(actor), listExtraClasses(actor), listCourses(actor), listTimeSlots(actor)]) : null,
  ]);

  const sessions: TimetableSession[] = [
    ...lessons,
    ...extras.map((e) => ({
      id: e.key,
      classCode: e.name,
      className: e.courseName,
      date: e.date,
      originalDate: null,
      startTime: e.startTime,
      endTime: e.endTime,
      timeSlotId: e.timeSlotId,
      roomName: e.roomName,
      teacherId: e.teacherId,
      teacherName: e.teacherName,
      teacherShortName: e.teacherShortName,
      substituteName: null,
      assistantName: null,
      kind: "regular" as const,
      status: "planned" as const,
      attendanceCount: 0,
      extra: true,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  // Màu theo giáo viên: giáo viên đang dạy xếp theo mã, mỗi người một độ đậm; lớp học thêm đậm nhất.
  const activeTeachers = teacherList.filter((t) => t.status === "active");
  const shadeByTeacher = new Map(activeTeachers.map((t, index) => [t.id, teacherShade(index, activeTeachers.length)]));
  const shadeOf = (s: TimetableSession) => (s.extra ? EXTRA_SHADE : shadeByTeacher.get(leadTeacherId(s) ?? ""));
  const shownTeachers = new Set(sessions.filter((s) => !s.extra && s.status !== "cancelled").map(leadTeacherId));
  const legend = activeTeachers
    .filter((t) => shownTeachers.has(t.id))
    .map((t) => ({ id: t.id, name: t.shortName || t.fullName, shade: shadeByTeacher.get(t.id)! }));
  const hasExtra = sessions.some((s) => s.extra);

  const caOf = (name: string) => (SLOT_NAME_LABELS as Record<string, string>)[name] ?? name;
  const timeOf = (start: string, end: string) => `${formatTime(start)}–${formatTime(end)}`;
  const extraFields: Field[] = options
    ? [
        { name: "name", label: "Lớp", required: true, hint: "Lớp ngoài hệ thống: chỉ để biết phòng đang có lớp trên Thời khóa biểu, không điểm danh." },
        { name: "courseId", label: "Khóa học", type: "select", required: true, options: options[3].map((c) => ({ value: c.id, label: c.name })) },
        { name: "roomId", label: "Phòng", type: "select", required: true, options: options[1].map((r) => ({ value: r.id, label: r.name })) },
        {
          name: "weekday",
          label: "Thứ",
          type: "select",
          required: true,
          options: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: WEEKDAY_LABELS[d]! })),
        },
        {
          name: "timeSlotId",
          label: "Ca – Khung giờ",
          type: "select",
          required: true,
          options: orderSlotFrames(options[4]).map((s) => ({
            value: s.id,
            label: `${caOf(s.name)} – Khung ${s.frame} (${timeOf(s.defaultStart, s.defaultEnd)})`,
          })),
          hint: "Lặp lại hằng tuần cho đến khi xóa. Báo trùng khi cùng Thứ, Ca, Khung giờ mà trùng phòng hoặc giáo viên.",
        },
        {
          name: "teacherId",
          label: "Giáo viên",
          type: "select",
          options: activeTeachers.map((t) => ({ value: t.id, label: `${t.code} – ${t.fullName}` })),
        },
      ]
    : [];

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
        <h1 className="text-xl font-semibold sm:text-2xl">{title}</h1>
        <div className="flex glass-solid rounded-full border p-1 text-sm">
          {(["week", "month"] as const).map((v) => (
            <Link
              key={v}
              href={href({ view: v })}
              aria-current={view === v ? "page" : undefined}
              className={`rounded-full px-4 py-1.5 transition-colors ${view === v ? "bg-brand-teal font-semibold text-foreground shadow-sm" : "hover:bg-muted"}`}
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
            {teacherList.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </select>
          <select name="classId" defaultValue={filters.classId} aria-label="Lọc theo lớp" className={selectClass}>
            <option value="">Tất cả lớp</option>
            {options[0].map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} – {c.name}
              </option>
            ))}
          </select>
          <select name="roomId" defaultValue={filters.roomId} aria-label="Lọc theo phòng" className={selectClass}>
            <option value="">Tất cả phòng</option>
            {options[1].map((r) => (
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

      <TimetableExport
        baseHref={`/api/export/timetable?${new URLSearchParams({ from: range.from, to: range.to, ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v)) })}`}
      />

      <TeacherLegend entries={legend} extraShade={hasExtra ? EXTRA_SHADE : undefined} />

      {view === "week" ? (
        options && canAdd ? (
          <ManualScheduler
            defaults={filters}
            options={{
              slots: slots.map((s) => ({ value: s.id, label: `${s.name} (${s.defaultStart.slice(0, 5)}–${s.defaultEnd.slice(0, 5)})` })),
              classes: options[0].filter((c) => c.status === "open").map((c) => ({ value: c.id, label: `${c.code} – ${c.name}` })),
              teachers: activeTeachers.map((t) => ({ value: t.id, label: `${t.code} – ${t.fullName}` })),
              rooms: options[1].map((r) => ({ value: r.id, label: `${r.name} (${r.capacity} chỗ)` })),
            }}
          >
            <p className="text-sm text-muted-foreground">Bấm dấu + ở một ô để xếp tay một buổi học vào ngày và ca đó.</p>
            <WeekView sessions={sessions} date={date} slots={slots} hrefOf={sessionHref} today={today} shadeOf={shadeOf} />
          </ManualScheduler>
        ) : (
          <WeekView sessions={sessions} date={date} slots={slots} hrefOf={sessionHref} today={today} shadeOf={shadeOf} />
        )
      ) : (
        <MonthView sessions={sessions} date={date} dayHref={(day) => href({ view: "week", date: day })} today={today} shadeOf={shadeOf} />
      )}

      {options && (
        <CrudSection
          title="Lớp học thêm"
          numbered
          columns={["Lớp", "Khóa học", "Phòng", "Thứ", "Ca", "Khung giờ", "Giáo viên"]}
          emptyText="Chưa có lớp học thêm. Thêm để Thời khóa biểu cho biết phòng đang có lớp."
          rows={options[2].map((e) => ({
            id: e.id,
            cells: [
              e.name,
              e.courseName,
              e.roomName,
              WEEKDAY_LABELS[e.weekday] ?? "",
              caOf(e.slotName),
              `Khung ${e.frame} (${timeOf(e.startTime, e.endTime)})`,
              e.teacherName ?? "",
            ],
            values: {
              name: e.name,
              courseId: e.courseId,
              roomId: e.roomId,
              weekday: String(e.weekday),
              timeSlotId: e.timeSlotId,
              teacherId: e.teacherId ?? "",
            },
          }))}
          fields={extraFields}
          createAction={canAdd ? createExtraClassAction : undefined}
          updateAction={canEdit ? updateExtraClassAction : undefined}
          deleteAction={canDelete ? deleteExtraClassAction : undefined}
        />
      )}
    </div>
  );
}
