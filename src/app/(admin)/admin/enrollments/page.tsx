import type { Metadata } from "next";
import { FormDialogButton } from "@/components/action-buttons";
import { selectClass } from "@/components/form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LABELS, formatDate, todayIso } from "@/lib/format";
import { enrollStudentAction, leaveEnrollmentAction } from "@/server/actions/admin";
import { listClasses, listEnrollments } from "@/server/services/classes";
import { listStudents } from "@/server/services/students";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Ghi danh" };

export default async function EnrollmentsPage({ searchParams }: PageProps<"/admin/enrollments">) {
  const { actor } = await requirePageUser("admin");
  const classes = await listClasses(actor);
  const raw = (await searchParams).classId;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  // Chỉ nhận classId có trong danh sách lớp (tránh truy vấn với giá trị tùy ý).
  const current = classes.find((c) => c.id === requested) ?? null;

  const [enrollments, students] = current
    ? await Promise.all([listEnrollments(actor, current.id), listStudents(actor)])
    : [[], []];
  const activeIds = new Set(enrollments.filter((e) => e.status === "active").map((e) => e.studentId));
  const candidates = students.filter((s) => s.status !== "left" && !activeIds.has(s.id));
  const today = todayIso();

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold">Ghi danh</h1>
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-1.5 text-sm font-medium">
          Lớp học
          <select name="classId" defaultValue={current?.id ?? ""} className={selectClass}>
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} – {c.name} ({c.studentCount}/{c.maxSize})
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" className="h-11">
          Xem
        </Button>
      </form>

      {current && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Sĩ số: <strong>{activeIds.size}</strong>/{current.maxSize} · {LABELS.classStatus[current.status]}
            </p>
            {current.status === "open" && (
              <FormDialogButton
                label="Ghi danh học viên"
                title={`Ghi danh vào ${current.code}`}
                fields={[
                  {
                    name: "studentId",
                    label: "Học viên",
                    type: "select",
                    required: true,
                    options: candidates.map((s) => ({ value: s.id, label: `${s.code} – ${s.fullName}` })),
                  },
                  { name: "joinedAt", label: "Ngày vào lớp", type: "date", required: true },
                ]}
                initial={{ joinedAt: today < current.startDate ? current.startDate : today }}
                action={enrollStudentAction.bind(null, current.id)}
                successMessage="Đã ghi danh."
              />
            )}
          </div>

          {enrollments.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Lớp chưa có học viên.
            </p>
          ) : (
            <ul className="grid gap-2">
              {enrollments.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium break-words">
                      {e.fullName} <span className="font-normal text-muted-foreground">({e.code})</span>
                    </p>
                    <p className="text-muted-foreground">
                      Vào lớp {formatDate(e.joinedAt)}
                      {e.leftAt && ` · rời lớp ${formatDate(e.leftAt)}`}
                    </p>
                  </div>
                  {e.status === "active" ? (
                    <FormDialogButton
                      label="Cho rời lớp"
                      variant="outline"
                      title={`Cho ${e.fullName} rời lớp`}
                      description="Lịch sử điểm danh và sao trước ngày rời lớp được giữ nguyên."
                      fields={[{ name: "leftAt", label: "Ngày rời lớp", type: "date", required: true }]}
                      initial={{ leftAt: today }}
                      fixed={{ id: e.id }}
                      action={leaveEnrollmentAction}
                      successMessage="Đã cập nhật."
                    />
                  ) : (
                    <Badge variant="outline">{LABELS.enrollmentStatus[e.status]}</Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
