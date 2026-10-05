import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { createCourseAction, deleteCourseAction, updateCourseAction } from "@/server/actions/admin";
import { listCourses } from "@/server/services/catalog";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Khóa học" };

const fields: Field[] = [
  { name: "name", label: "Tên khóa học", required: true },
  { name: "totalSessions", label: "Tổng số buổi", type: "number", required: true },
  { name: "description", label: "Mô tả", type: "textarea" },
];

export default async function CoursesPage() {
  const { actor } = await requirePageUser("admin");
  const courses = await listCourses(actor);
  return (
    <CrudSection
      title="Khóa học"
      numbered
      columns={["Tên khóa học", "Số buổi", "Mô tả"]}
      rows={courses.map((c) => ({
        id: c.id,
        cells: [c.name, String(c.totalSessions), c.description ?? ""],
        values: { name: c.name, totalSessions: String(c.totalSessions), description: c.description ?? "" },
      }))}
      fields={fields}
      createAction={createCourseAction}
      updateAction={updateCourseAction}
      deleteAction={deleteCourseAction}
    />
  );
}
