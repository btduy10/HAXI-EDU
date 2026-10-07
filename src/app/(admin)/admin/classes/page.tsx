import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { orderSlotFrames } from "@/domain/time-slots";
import { WEEKDAY_LABELS } from "@/lib/dates";
import { LABELS, formatDate, formatTime } from "@/lib/format";
import { SLOT_NAME_LABELS } from "@/lib/validation/entities";
import {
  createClassAction,
  createExtraClassAction,
  deleteClassAction,
  deleteExtraClassAction,
  updateClassAction,
  updateExtraClassAction,
} from "@/server/actions/admin";
import { listCourses, listRooms, listTeachers, listTimeSlots } from "@/server/services/catalog";
import { listClasses } from "@/server/services/classes";
import { listExtraClasses } from "@/server/services/extra-classes";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Lớp học" };

export default async function ClassesPage() {
  const { actor, role, can } = await requireMenu("classes");
  const [classes, courses, rooms, extras, teachers, slots] = await Promise.all([
    listClasses(actor),
    listCourses(actor),
    listRooms(actor),
    listExtraClasses(actor),
    listTeachers(actor),
    listTimeSlots(actor),
  ]);
  const caOf = (name: string) => (SLOT_NAME_LABELS as Record<string, string>)[name] ?? name;
  const timeOf = (start: string, end: string) => `${formatTime(start)}–${formatTime(end)}`;

  const fields: Field[] = [
    { name: "code", label: "Mã lớp", required: true },
    { name: "name", label: "Tên lớp", required: true },
    {
      name: "courseId",
      label: "Khóa học",
      type: "select",
      required: true,
      options: courses.map((c) => ({ value: c.id, label: c.name })),
    },
    {
      name: "defaultRoomId",
      label: "Phòng mặc định",
      type: "select",
      options: rooms.map((r) => ({ value: r.id, label: `${r.name} (${r.capacity} chỗ)` })),
    },
    { name: "startDate", label: "Ngày bắt đầu", type: "date", required: true },
    { name: "endDate", label: "Ngày kết thúc", type: "date", required: true },
    { name: "maxSize", label: "Sĩ số tối đa", type: "number", required: true },
  ];

  const extraFields: Field[] = [
    { name: "name", label: "Lớp", required: true, hint: "Lớp ngoài hệ thống: chỉ để biết phòng đang có lớp trên Thời khóa biểu, không điểm danh." },
    { name: "courseId", label: "Khóa học", type: "select", required: true, options: courses.map((c) => ({ value: c.id, label: c.name })) },
    { name: "roomId", label: "Phòng", type: "select", required: true, options: rooms.map((r) => ({ value: r.id, label: r.name })) },
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
      options: orderSlotFrames(slots).map((s) => ({
        value: s.id,
        label: `${caOf(s.name)} – Khung ${s.frame} (${timeOf(s.defaultStart, s.defaultEnd)})`,
      })),
      hint: "Lặp lại hằng tuần cho đến khi xóa. Báo trùng khi cùng Thứ, Ca, Khung giờ mà trùng phòng hoặc giáo viên.",
    },
    {
      name: "teacherId",
      label: "Giáo viên",
      type: "select",
      options: teachers.filter((t) => t.status === "active").map((t) => ({ value: t.id, label: `${t.code} – ${t.fullName}` })),
    },
  ];

  return (
    <div className="grid gap-8">
      <CrudSection
        title="Lớp học"
        numbered
        columns={["Lớp", "Khóa học", "Phòng", "Thời gian", "Sĩ số", "Trạng thái"]}
        rows={classes.map((c) => ({
          id: c.id,
          href: `/admin/classes/${c.id}`,
          cells: [
            `${c.code} – ${c.name}`,
            c.courseName,
            c.roomName ?? "",
            `${formatDate(c.startDate)} – ${formatDate(c.endDate)}`,
            `${c.studentCount}/${c.maxSize}`,
            LABELS.classStatus[c.status],
          ],
          values: {
            code: c.code,
            name: c.name,
            courseId: c.courseId,
            defaultRoomId: c.defaultRoomId ?? "",
            startDate: c.startDate,
            endDate: c.endDate,
            maxSize: String(c.maxSize),
          },
        }))}
        fields={fields}
        createAction={can("add") ? createClassAction : undefined}
        updateAction={can("edit") ? updateClassAction : undefined}
        deleteAction={role === "admin" ? deleteClassAction : undefined}
      />
      <CrudSection
        title="Lớp học thêm"
        numbered
        columns={["Lớp", "Khóa học", "Phòng", "Thứ", "Ca", "Khung giờ", "Giáo viên"]}
        emptyText="Chưa có lớp học thêm. Thêm để Thời khóa biểu cho biết phòng đang có lớp."
        rows={extras.map((e) => ({
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
        createAction={can("add") ? createExtraClassAction : undefined}
        updateAction={can("edit") ? updateExtraClassAction : undefined}
        deleteAction={role === "admin" ? deleteExtraClassAction : undefined}
      />
    </div>
  );
}
