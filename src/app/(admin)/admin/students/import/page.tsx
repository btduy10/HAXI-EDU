import type { Metadata } from "next";
import { ExcelImportForm } from "@/components/excel-import-form";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Nhập học viên từ Excel" };

export default async function ImportStudentsPage() {
  await requirePageUser("admin");
  return <ExcelImportForm kind="students" />;
}
