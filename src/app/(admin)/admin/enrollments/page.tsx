import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton, FormDialogButton } from "@/components/action-buttons";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { BackLink } from "@/components/back-link";
import { AddStudentButton, RosterEnroll } from "@/components/roster-enroll";
import { Badge } from "@/components/ui/badge";
import { ROSTER_ROWS, rosterTime } from "@/domain/roster";
import { LABELS, formatDate, todayIso } from "@/lib/format";
import { deleteEnrollmentAction, enrollStudentAction, leaveEnrollmentAction } from "@/server/actions/admin";
import { listClasses, listEnrollments, weeklyRoster } from "@/server/services/classes";
import { listStudents } from "@/server/services/students";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Ghi danh" };

export default async function EnrollmentsPage({ searchParams }: PageProps<"/admin/enrollments">) {
  const { actor, role, can } = await requireMenu("enrollments");
  const classes = await listClasses(actor);
  const raw = (await searchParams).classId;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  // Chỉ nhận classId có trong danh sách lớp (tránh truy vấn với giá trị tùy ý).
  const current = classes.find((c) => c.id === requested) ?? null;

  // Chưa chọn lớp: tổng quan các lớp đang học theo buổi trong tuần. Đã chọn lớp: danh sách ghi danh chi tiết của lớp đó.
  const [enrollments, students, roster] = await Promise.all([
    current ? listEnrollments(actor, current.id) : [],
    can("add") ? listStudents(actor) : [],
    current ? null : weeklyRoster(actor),
  ]);
  const activeIds = new Set(enrollments.filter((e) => e.status === "active").map((e) => e.studentId));
  const enrollable = students.filter((s) => s.status !== "left");
  const candidates = enrollable.filter((s) => !activeIds.has(s.id));
  const today = todayIso();

  return (
    <div className="grid gap-4">
      <div className="grid gap-2">
        {current && <BackLink href="/admin/enrollments">Tổng quan ghi danh</BackLink>}
        <h1 className="text-xl font-semibold sm:text-2xl">Ghi danh</h1>
      </div>
      <form>
        {/* Chọn lớp là hiện danh sách ngay. Màn hình rộng: ô chọn chỉ chiếm nửa chiều ngang. */}
        <label className="grid gap-1.5 text-sm font-medium sm:w-1/2">
          Lớp học
          <AutoSubmitSelect name="classId" defaultValue={current?.id ?? ""}>
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} – {c.name} ({c.studentCount}/{c.maxSize})
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
      </form>

      {current && (
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm">
              Sĩ số: <strong>{activeIds.size}</strong>/{current.maxSize} · {LABELS.classStatus[current.status]}
            </p>
            {current.status === "open" && can("add") && (
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
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              Lớp chưa có học viên.
            </p>
          ) : (
            <ul className="grid gap-2">
              {enrollments.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 glass-solid rounded-xl border p-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium break-words">
                      <span className="tabular-nums">{e.code}</span> <span className="font-normal text-muted-foreground">–</span> {e.fullName}
                    </p>
                    <p className="text-muted-foreground">
                      Vào lớp {formatDate(e.joinedAt)}
                      {e.leftAt && ` · rời lớp ${formatDate(e.leftAt)}`}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {e.status === "active" && can("edit") ? (
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
                      <Badge variant={e.status === "active" ? "secondary" : "outline"}>{LABELS.enrollmentStatus[e.status]}</Badge>
                    )}
                    {/* Ghi danh nhập sai: chỉ Admin xóa hẳn, và chỉ khi lớp còn mở. */}
                    {role === "admin" && current.status === "open" && (
                      <ConfirmButton
                        label="Xóa"
                        variant="destructive"
                        confirmText={`Xóa hẳn ghi danh của ${e.fullName} ở lớp ${current.code}? Điểm danh và lịch sử sao của em ở lớp này trong thời gian ghi danh cũng bị xóa. Không hoàn tác được.`}
                        action={deleteEnrollmentAction}
                        input={{ id: e.id }}
                        successMessage="Đã xóa ghi danh."
                      />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {roster && (
        <RosterEnroll
          students={enrollable.map((s) => ({ value: s.id, label: `${s.code} – ${s.fullName}` }))}
          activeByClass={Object.fromEntries(roster.blocks.map((b) => [b.classId, b.students.map((s) => s.id)]))}
          today={today}
        >
          <p className="text-sm text-muted-foreground">
            Các lớp đang học theo buổi trong tuần (theo Thời khóa biểu tuần này). Bấm tên lớp để xem lịch sử ghi danh, cho rời lớp.
            {can("add") && " Bấm một hàng “Thêm … học viên” để thêm học viên vào lớp."}
          </p>
          {roster.blocks.length === 0 ? (
            <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có lớp đang mở nào có buổi học trong tuần hoặc lịch mẫu.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {roster.blocks.map((block) => {
                const rows = Math.max(ROSTER_ROWS, block.students.length);
                // Số chỗ còn lại theo sĩ số tối đa: mỗi chỗ một hàng "Thêm n học viên".
                const free = block.maxSize - block.students.length;
                return (
                  <section key={block.key} data-roster={block.classCode} className="glass-solid min-w-0 overflow-hidden rounded-2xl border text-sm">
                    <header className="grid gap-0.5 border-b bg-muted/60 px-3 py-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <h2 className="font-semibold">
                          {block.label} - {rosterTime(block.startTime)} - {rosterTime(block.endTime)}
                        </h2>
                        <span className="text-muted-foreground tabular-nums" aria-label={`Sĩ số ${block.students.length} trên ${block.maxSize}`}>
                          {block.students.length}/{block.maxSize}
                        </span>
                      </div>
                      <Link
                        href={`/admin/enrollments?classId=${block.classId}`}
                        className="w-fit max-w-full truncate rounded text-primary underline-offset-2 outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        {block.className}
                        {block.teacherName && ` - ${block.teacherName}`}
                      </Link>
                    </header>
                    <table className="w-full table-fixed">
                      <thead>
                        <tr className="text-xs text-muted-foreground">
                          <th className="w-10 px-1 py-1.5 text-center font-medium">STT</th>
                          <th className="px-2 py-1.5 text-left font-medium">Họ tên HS</th>
                          <th className="w-12 px-1 py-1.5 text-center font-medium">Lớp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: rows }, (_, index) => {
                          const student = block.students[index];
                          const seat = index - block.students.length + 1;
                          return (
                            <tr key={index} className="h-10 border-t md:h-8">
                              <td className="px-1 text-center text-muted-foreground tabular-nums">{index + 1}</td>
                              {student ? (
                                <>
                                  <td className="truncate px-2" title={student.fullName}>
                                    {student.fullName}
                                  </td>
                                  <td className="px-1 text-center tabular-nums">{student.schoolGrade ?? ""}</td>
                                </>
                              ) : (
                                <td colSpan={2} className="px-1">
                                  {seat <= free && can("add") && (
                                    <AddStudentButton
                                      classId={block.classId}
                                      classCode={block.classCode}
                                      startDate={block.startDate}
                                      seat={seat}
                                      label={`Thêm ${seat} học viên vào ${block.className}, ${block.label}`}
                                    />
                                  )}
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </section>
                );
              })}
            </div>
          )}
          {roster.unscheduled.length > 0 && (
            <p className="text-sm text-muted-foreground">
              Lớp đang mở chưa có buổi học trong tuần và chưa có lịch mẫu (chưa thuộc buổi nào):{" "}
              {roster.unscheduled.map((c, index) => (
                <span key={c.id}>
                  {index > 0 && ", "}
                  <Link href={`/admin/enrollments?classId=${c.id}`} className="text-primary underline-offset-2 hover:underline">
                    {c.code} – {c.name}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </RosterEnroll>
      )}
    </div>
  );
}
