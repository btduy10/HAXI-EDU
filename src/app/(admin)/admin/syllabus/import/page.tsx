import type { Metadata } from "next";
import { ExcelImportForm } from "@/components/excel-import-form";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Nhập Syllabus từ Excel" };

export default async function ImportSyllabusPage() {
  await requirePageUser("admin");
  return (
    <ExcelImportForm
      kind="syllabus"
      note='Bốn cột: Lớp (mã lớp ở menu Lớp học), Mã môn, Tiết, Tên bài. Bài đã có cùng Lớp + Mã môn + Tiết sẽ được cập nhật tên bài.'
    />
  );
}
