import type { Metadata } from "next";
import { StarsPage } from "@/components/stars-page";
import { uuidParam } from "@/server/page";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Ghi sao" };

export default async function TeacherStarsPage({ params }: PageProps<"/teacher/sessions/[id]/stars">) {
  const { actor } = await requirePageUser("teacher");
  return <StarsPage actor={actor} sessionId={uuidParam((await params).id)} backHref="/teacher/dashboard" />;
}