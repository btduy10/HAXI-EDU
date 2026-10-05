import type { Metadata } from "next";
import Link from "next/link";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LABELS, formatDate, toOptions } from "@/lib/format";
import { createStudentAction, deleteStudentAction, updateStudentAction } from "@/server/actions/admin";
import { listStudents } from "@/server/services/students";
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
  const students = await listStudents(actor, q);

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <form className="flex flex-1 gap-2" role="search">
          <Input name="q" defaultValue={q} placeholder="Tìm theo tên hoặc mã…" aria-label="Tìm học viên" className="h-10" />
          <Button type="submit" variant="outline" className="h-10">
            Tìm
          </Button>
        </form>
        <Button variant="outline" className="h-10" nativeButton={false} render={<Link href="/admin/students/import" />}>
          Nhập từ Excel
        </Button>
      </div>
      <CrudSection
        title="Học viên"
        columns={["Họ tên", "Mã HV", "Ngày sinh", "Khối", "Phụ huynh", "Điện thoại", "Trạng thái"]}
        rows={students.map((s) => ({
          id: s.id,
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
        emptyText={q ? "Không tìm thấy học viên phù hợp." : "Chưa có học viên."}
      />
    </div>
  );
}
