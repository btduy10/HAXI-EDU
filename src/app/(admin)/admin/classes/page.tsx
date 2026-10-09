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
  const [classes, courses, rooms] = await Promise.all([listClasses(actor, { includeTimetableOnly: true }), listCourses(actor), listRooms(actor)]);

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
    {
      name: "timetableOnly",
      label: "Hiển thị",
      type: "select",
      required: true,
      defaultValue: "false",
      options: [
        { value: "false", label: "Đầy đủ (điểm danh, sao, học phí…)" },
        { value: "true", label: "Chỉ trên Thời khóa biểu" },
      ],
      hint: "Chỉ trên Thời khóa biểu: dùng để giữ lịch phòng (vd. cho mượn phòng). Lớp vẫn được kiểm tra trùng phòng nhưng không hiện ở Điểm danh, Sao, Ghi danh, Học phí, Chấm công, Báo cáo.",
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
            c.timetableOnly ? "" : `${c.studentCount}/${c.maxSize}`,
            c.timetableOnly ? `${LABELS.classStatus[c.status]} · Chỉ Thời khóa biểu` : LABELS.classStatus[c.status],
          ],
          values: {
            code: c.code,
            name: c.name,
            courseId: c.courseId,
            defaultRoomId: c.defaultRoomId ?? "",
            startDate: c.startDate,
            endDate: c.endDate,
            maxSize: String(c.maxSize),
            timetableOnly: String(c.timetableOnly),
          },
        }))}
        fields={fields}
        createAction={can("add") ? createClassAction : undefined}
        updateAction={can("edit") ? updateClassAction : undefined}
        deleteAction={role === "admin" ? deleteClassAction : undefined}
      />
    </div>
  );
}
