import type { Metadata } from "next";
import { StarsPage } from "@/components/stars-page";
import { uuidParam } from "@/server/page";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Ghi sao" };

export default async function AdminStarsPage({ params }: PageProps<"/admin/sessions/[id]/stars">) {
  const { actor } = await requirePageUser("admin");
  const id = uuidParam((await params).id);
  return <StarsPage actor={actor} sessionId={id} backHref={`/admin/sessions/${id}`} />;
}