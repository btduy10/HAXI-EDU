import type { Metadata } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { LABELS, formatDate } from "@/lib/format";
import { orNotFound, uuidParam } from "@/server/page";
import { getClass, listClassTeachers } from "@/server/services/classes";
import { listClassStudents } from "@/server/services/students";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Lớp của tôi" };

export default async function TeacherClassPage({ params }: PageProps<"/teacher/classes/[id]">) {
  const { actor } = await requirePageUser("teacher");
  const classId = uuidParam((await params).id);
  // getClass kiểm tra quyền sở hữu lớp; lớp của GV khác trả 404.
  const cls = await orNotFound(getClass(actor, classId));
  const [teachers, students] = await Promise.all([listClassTeachers(actor, classId), listClassStudents(actor, classId)]);

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        <Link href="/teacher/classes" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
          ← Lớp của tôi
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-semibold">
            {cls.code} – {cls.name}
          </h1>
          <Badge variant={cls.status === "open" ? "secondary" : "outline"}>{LABELS.classStatus[cls.status]}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {cls.courseName}
          {cls.roomName && ` · ${cls.roomName}`} · {formatDate(cls.startDate)} – {formatDate(cls.endDate)}
        </p>
        <p className="text-sm text-muted-foreground">
          Giáo viên: {teachers.map((t) => `${t.fullName} (${LABELS.classTeacherRole[t.role]})`).join(", ")}
        </p>
      </div>

      <section className="grid gap-2">
        <h2 className="font-medium">
          Học viên <span className="text-sm font-normal text-muted-foreground">({students.length})</span>
        </h2>
        {students.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Lớp chưa có học viên.
          </p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {students.map((s) => (
              <li key={s.id} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{s.fullName}</p>
                <p className="text-muted-foreground">
                  {s.code}
                  {s.schoolGrade ? ` · khối ${s.schoolGrade}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
