import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Input } from "@/components/ui/input";
import { LABELS, formatDate, toOptions } from "@/lib/format";
import { createStudentAction, deleteStudentAction, updateStudentAction } from "@/server/actions/admin";
import { listStudentsPage } from "@/server/services/students";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Học viên" };

const fields: Field[] = [
  { name: "code", label: "Mã HV", required: true },
  { name: "fullName", label: "Họ tên", required: true },
  { name: "birthDate", label: "Ngày sinh", type: "date" },
  { name: "gender", label: "Giới tính", type: "select", options: toOptions(LABELS.gender) },
  { name: "schoolGrade", label: "Khối lớp (1–12)", type: "number" },
  { name: "guardianName", label: "Phụ huynh" },
  { name: "phone", label: "Điện thoại liên hệ" },
  { name: "status", label: "Trạng thái", type: "select", required: true, options: toOptions(LABELS.studentStatus), defaultValue: "active" },
  { name: "note", label: "Ghi chú", type: "textarea" },
];

export default async function StudentsPage({ searchParams }: PageProps<"/admin/students">) {
  const { actor } = await requirePageUser("admin");
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100) ?? "";
  const rawPage = (await searchParams).page;
  const { rows: students, total, page, pageCount, pageSize } = await listStudentsPage(
    actor,
    q,
    Number(Array.isArray(rawPage) ? rawPage[0] : rawPage),
  );
  const pageHref = (n: number) => {
    const query = new URLSearchParams();
    if (q) query.set("q", q);
    if (n > 1) query.set("page", String(n));
    const text = query.toString();
    return text ? `/admin/students?${text}` : "/admin/students";
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form className="flex flex-1 gap-2" role="search">
          <Input name="q" defaultValue={q} placeholder="Tìm theo tên hoặc mã…" aria-label="Tìm học viên" className="h-10" />
          <Button type="submit" variant="outline" className="h-10">
            Tìm
          </Button>
        </form>
        <LinkButton variant="outline" className="h-10" href="/admin/students/import">
          Nhập từ Excel
        </LinkButton>
      </div>
      <CrudSection
        title="Học viên"
        numbered
        centered={["Khối"]}
        startIndex={(page - 1) * pageSize}
        total={total}
        footer={
          pageCount > 1 && (
            <nav aria-label="Phân trang học viên" className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Trang {page}/{pageCount} · {total} học viên
              </p>
              <div className="flex flex-wrap gap-1">
                {page > 1 && (
                  <LinkButton variant="outline" className="h-10" href={pageHref(page - 1)}>
                    ‹ Trước
                  </LinkButton>
                )}
                {Array.from({ length: pageCount }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === pageCount || Math.abs(n - page) <= 1)
                  .map((n) => (
                    <LinkButton
                      key={n}
                      variant={n === page ? "default" : "outline"}
                      className="h-10 min-w-10"
                      href={pageHref(n)}
                      aria-label={`Trang ${n}`}
                      aria-current={n === page ? "page" : undefined}
                    >
                      {n}
                    </LinkButton>
                  ))}
                {page < pageCount && (
                  <LinkButton variant="outline" className="h-10" href={pageHref(page + 1)}>
                    Sau ›
                  </LinkButton>
                )}
              </div>
            </nav>
          )
        }
        columns={["Họ tên", "Mã HV", "Ngày sinh", "Khối", "Phụ huynh", "Điện thoại", "Trạng thái"]}
        rows={students.map((s) => ({
          id: s.id,
          href: `/admin/students/${s.id}`,
          cells: [
            s.fullName,
            s.code,
            formatDate(s.birthDate),
            s.schoolGrade ? String(s.schoolGrade) : "",
            s.guardianName ?? "",
            s.phone ?? "",
            LABELS.studentStatus[s.status],
          ],
          values: {
            code: s.code,
            fullName: s.fullName,
            birthDate: s.birthDate ?? "",
            gender: s.gender ?? "",
            schoolGrade: s.schoolGrade ? String(s.schoolGrade) : "",
            guardianName: s.guardianName ?? "",
            phone: s.phone ?? "",
            status: s.status,
            note: s.note ?? "",
          },
        }))}
        fields={fields}
        createAction={createStudentAction}
        updateAction={updateStudentAction}
        deleteAction={deleteStudentAction}
        detailLabel="Sao & avatar"
        emptyText={q ? "Không tìm thấy học viên phù hợp." : "Chưa có học viên."}
      />
    </div>
  );
}
