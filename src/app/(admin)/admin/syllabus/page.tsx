import type { Metadata } from "next";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { LinkButton } from "@/components/link-button";
import { LABELS } from "@/lib/format";
import { createSyllabusLessonAction, deleteSyllabusLessonAction, updateSyllabusLessonAction } from "@/server/actions/admin";
import { listClasses } from "@/server/services/classes";
import { listSyllabus } from "@/server/services/syllabus";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Syllabus" };

export default async function SyllabusPage({ searchParams }: PageProps<"/admin/syllabus">) {
  const { actor, role, can } = await requireMenu("syllabus");
  const classes = await listClasses(actor);
  const raw = (await searchParams).classId;
  // Chỉ nhận lớp có trong danh sách (tránh truy vấn với giá trị tùy ý).
  const current = classes.find((c) => c.id === (Array.isArray(raw) ? raw[0] : raw)) ?? null;
  const lessons = await listSyllabus(actor, { classId: current?.id });
  const admin = role === "admin";

  const fields: Field[] = [
    {
      name: "classId",
      label: "Lớp",
      type: "select",
      required: true,
      defaultValue: current?.id,
      options: classes.map((c) => ({ value: c.id, label: `${c.code} – ${c.name}` })),
    },
    { name: "subjectCode", label: "Mã môn", required: true, hint: "Vd. ROB, AI." },
    { name: "period", label: "Tiết", type: "number", required: true },
    { name: "title", label: "Tên bài", required: true, hint: "Giáo viên chọn tên bài này ở ô Nội dung buổi học khi điểm danh." },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <form className="min-w-0 flex-1 sm:max-w-sm">
          <label className="grid gap-1.5 text-sm font-medium">
            Lớp học
            <AutoSubmitSelect name="classId" defaultValue={current?.id ?? ""}>
              <option value="">Tất cả lớp</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} – {c.name} ({LABELS.classStatus[c.status]})
                </option>
              ))}
            </AutoSubmitSelect>
          </label>
        </form>
        {admin && (
          <div className="flex flex-wrap gap-2">
            {/* Tải tệp: dùng thẻ <a> thường để trình duyệt tự tải về, không qua router. */}
            <a href="/api/import/syllabus" download className="inline-flex h-10 items-center rounded-full border bg-white/80 px-4 text-sm font-medium hover:bg-muted">
              Tải tệp mẫu
            </a>
            <LinkButton variant="outline" className="h-10" href="/admin/syllabus/import">
              Nhập Excel
            </LinkButton>
          </div>
        )}
      </div>
      <CrudSection
        title="Syllabus"
        numbered
        centered={["Tiết"]}
        columns={["Mã môn", "Lớp", "Tiết", "Tên bài"]}
        emptyText="Chưa có bài học nào. Thêm từng bài hoặc nhập từ Excel."
        rows={lessons.map((l) => ({
          id: l.id,
          label: `${l.classCode} · ${l.subjectCode} · Tiết ${l.period}`,
          cells: [l.subjectCode, l.classCode, String(l.period), l.title],
          values: { classId: l.classId, subjectCode: l.subjectCode, period: String(l.period), title: l.title },
        }))}
        fields={fields}
        createAction={can("add") ? createSyllabusLessonAction : undefined}
        updateAction={can("edit") ? updateSyllabusLessonAction : undefined}
        deleteAction={admin ? deleteSyllabusLessonAction : undefined}
      />
    </div>
  );
}
