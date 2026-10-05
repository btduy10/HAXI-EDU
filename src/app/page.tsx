import { redirect } from "next/navigation";
import { getSessionUser, homeOf, pendingStep } from "@/server/session";

export default async function RootPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  redirect(pendingStep(user) ?? homeOf(user));
}
