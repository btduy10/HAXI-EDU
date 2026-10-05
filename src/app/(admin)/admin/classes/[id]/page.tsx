import type { Metadata } from "next";
import Link from "next/link";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LABELS, formatDate, toOptions } from "@/lib/format";
import { assignTeacherAction, unassignTeacherAction } from "@/server/actions/admin";
import { orNotFound, uuidParam } from "@/server/page";
import { listTeachers } from "@/server/services/catalog";
import { getClass, listClassTeachers } from "@/server/services/classes";
import { listClassStudents } from "@/server/services/students";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Chi tiết lớp" };

export default async function ClassDetailPage({ params }: PageProps<"/admin/classes/[id]">) {
  const { actor } = await requirePageUser("admin");
  const classId = uuidParam((await params).id);
  const cls = await orNotFound(getClass(actor, classId));
  const [assigned, teachers, students] = await Promise.all([
    listClassTeachers(actor, classId),
    listTeachers(actor),
    listClassStudents(actor, classId),
  ]);

  const assignedIds = new Set(assigned.map((a) => a.teacherId));
  const teacherFields: Field[] = [
    {
      name: "teacherId",
      label: "Giáo viên",
      type: "select",
      required: true,
      options: teachers
        .filter((t) => t.status === "active" && !assignedIds.has(t.id))
        .map((t) => ({ value: t.id, label: `${t.code} – ${t.fullName}` })),
    },
    { name: "role", label: "Vai trò", type: "select", required: true, options: toOptions(LABELS.classTeacherRole), defaultValue: "main" },
  ];

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link href="/admin/classes" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← Danh sách lớp
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">
            {cls.code} – {cls.name}
          </h1>
          <Badge variant={cls.status === "open" ? "secondary" : "outline"}>{LABELS.classStatus[cls.status]}</Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Khóa học:</dt>
            <dd>{cls.courseName}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Phòng mặc định:</dt>
            <dd>{cls.roomName ?? "Chưa chọn"}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Thời gian:</dt>
            <dd>
              {formatDate(cls.startDate)} – {formatDate(cls.endDate)}
            </dd>
          </div>
          <div className="flex gap-2">
            <dt className="text-muted-foreground">Sĩ số:</dt>
            <dd>
              {students.length}/{cls.maxSize}
            </dd>
          </div>
        </dl>
      </div>

      <CrudSection
        title="Giáo viên phụ trách"
        addLabel="Phân công"
        columns={["Họ tên", "Mã GV", "Vai trò"]}
        rows={assigned.map((a) => ({
          id: a.id,
          cells: [a.fullName, a.code, LABELS.classTeacherRole[a.role]],
          values: {},
        }))}
        fields={teacherFields}
        createAction={assignTeacherAction.bind(null, classId)}
        deleteAction={unassignTeacherAction}
        emptyText="Chưa phân công giáo viên."
      />

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Học viên đang học <span className="text-sm font-normal text-muted-foreground">({students.length})</span>
          </h2>
          <Button
            variant="outline"
            className="h-10"
            nativeButton={false}
            render={<Link href={`/admin/enrollments?classId=${classId}`} />}
          >
            Quản lý ghi danh
          </Button>
        </div>
        {students.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Chưa có học viên ghi danh.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {students.map((s) => (
              <li key={s.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{s.fullName}</p>
                <p className="text-muted-foreground">
                  {s.code} · vào lớp {formatDate(s.joinedAt)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
