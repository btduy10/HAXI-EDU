import type { Metadata } from "next";
import { StudentStarProfile } from "@/components/student-star-profile";
import { uuidParam } from "@/server/page";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Học viên" };

export default async function TeacherStudentPage({ params }: PageProps<"/teacher/students/[id]">) {
  const { actor } = await requirePageUser("teacher");
  return <StudentStarProfile actor={actor} studentId={uuidParam((await params).id)} backHref="/teacher/classes" />;
}