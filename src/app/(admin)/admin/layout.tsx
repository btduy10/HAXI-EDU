import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/server/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePageUser("admin");
  return (
    <AppShell role="admin" userName={user.name}>
      {children}
    </AppShell>
  );
}
