import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { LABELS, formatDate } from "@/lib/format";
import { createClassAction, deleteClassAction, updateClassAction } from "@/server/actions/admin";
import { listCourses, listRooms } from "@/server/services/catalog";
import { listClasses } from "@/server/services/classes";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Lớp học" };

export default async function ClassesPage() {
  const { actor, role, can } = await requireMenu("classes");
  const [classes, courses, rooms] = await Promise.all([listClasses(actor), listCourses(actor), listRooms(actor)]);

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

  return (
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
  );
}
