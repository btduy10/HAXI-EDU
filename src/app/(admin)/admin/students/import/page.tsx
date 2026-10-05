import type { Metadata } from "next";
import { requirePageUser } from "@/server/session";
import { ImportForm } from "./import-form";

export const metadata: Metadata = { title: "Nhập học viên từ Excel" };

export default async function ImportStudentsPage() {
  await requirePageUser("admin");
  return <ImportForm />;
}
