import { AppShell } from "@/components/app-shell";
import { navFor } from "@/server/nav";
import { requirePageUser } from "@/server/session";

export default async function TeacherLayout({ children }: LayoutProps<"/teacher">) {
  const user = await requirePageUser("teacher");
  return (
    <AppShell {...navFor(user.actor)} userName={user.name}>
      {children}
    </AppShell>
  );
}
