import type { Metadata } from "next";
import { StarsPage } from "@/components/stars-page";
import { uuidParam } from "@/server/page";
import { redirect } from "next/navigation";
import { can } from "@/server/guard";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Ghi sao" };

export default async function TeacherStarsPage({ params }: PageProps<"/teacher/sessions/[id]/stars">) {
  const { actor } = await requirePageUser("teacher");
  if (!can(actor, "stars", "view")) redirect("/teacher/dashboard");
  return <StarsPage area="teacher" actor={actor} sessionId={uuidParam((await params).id)} backHref="/teacher/dashboard" />;
}