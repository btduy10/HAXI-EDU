import type { Metadata } from "next";
import { CrudSection } from "@/components/crud-section";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { Input } from "@/components/ui/input";
import { LABELS, formatDate } from "@/lib/format";
import { studentFields } from "@/lib/student-fields";
import { createStudentAction, deleteStudentAction, updateStudentAction } from "@/server/actions/admin";
import { listStudentsPageWithStars } from "@/server/services/student-history";
import { suggestStudentCode } from "@/server/services/students";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "QL Học viên" };

export default async function StudentsPage({ searchParams }: PageProps<"/admin/students">) {
  const { actor, role, can } = await requireMenu("students");
  const admin = role === "admin";
  // Ngoài Admin: không hiện và không nhập thông tin riêng tư của học viên. Form thêm mới điền sẵn mã tự cấp kế tiếp.
  const formFields = studentFields({ admin, suggestedCode: can("add") ? await suggestStudentCode() : undefined });
  const columns = ["Mã HV", "Họ tên", ...(admin ? ["Ngày sinh"] : []), "Khối", ...(admin ? ["Phụ huynh", "Điện thoại"] : []), "Sao", "Trạng thái"];
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.slice(0, 100) ?? "";
  const rawPage = (await searchParams).page;
  const { rows: students, total, page, pageCount, pageSize } = await listStudentsPageWithStars(
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
        {admin && (
          <LinkButton variant="outline" className="h-10" href="/admin/students/import">
            Nhập từ Excel
          </LinkButton>
        )}
      </div>
      <CrudSection
        title="Học viên"
        numbered
        centered={["Khối", "Sao"]}
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
        columns={columns}
        rows={students.map((s) => ({
          id: s.id,
          href: `/admin/students/${s.id}`,
          label: s.fullName,
          cells: [
            s.code,
            s.fullName,
            ...(admin ? [formatDate(s.birthDate)] : []),
            s.schoolGrade ? String(s.schoolGrade) : "",
            ...(admin ? [s.guardianName ?? "", s.phone ?? ""] : []),
            String(s.stars),
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
        fields={formFields}
        editFields={studentFields({ admin })}
        createAction={can("add") ? createStudentAction : undefined}
        updateAction={can("edit") ? updateStudentAction : undefined}
        deleteAction={admin ? deleteStudentAction : undefined}
        detailLabel="Hồ sơ"
        emptyText={q ? "Không tìm thấy học viên phù hợp." : "Chưa có học viên."}
      />
    </div>
  );
}
