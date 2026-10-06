import type { Metadata } from "next";
import { StarsPage } from "@/components/stars-page";
import { uuidParam } from "@/server/page";
import { requireMenu } from "@/server/session";

export const metadata: Metadata = { title: "Ghi sao" };

export default async function AdminStarsPage({ params }: PageProps<"/admin/sessions/[id]/stars">) {
  const { actor, can } = await requireMenu("stars");
  const id = uuidParam((await params).id);
  return <StarsPage actor={actor} sessionId={id} area="admin" backHref={can("view", "timetable") ? `/admin/sessions/${id}` : "/admin/stars"} />;
}