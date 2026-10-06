import type { Metadata } from "next";
import { StudentStarProfile } from "@/components/student-star-profile";
import { uuidParam } from "@/server/page";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Học viên" };

export default async function AdminStudentPage({ params }: PageProps<"/admin/students/[id]">) {
  const { actor } = await requireMenu("students");
  return <StudentStarProfile actor={actor} studentId={uuidParam((await params).id)} backHref="/admin/students" />;
}