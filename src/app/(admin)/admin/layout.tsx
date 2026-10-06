import { AppShell } from "@/components/app-shell";
import { navFor } from "@/server/nav";
import { requirePageUser } from "@/server/session";

// Khu vực quản lý: Admin thấy mọi menu; vai trò khác chỉ thấy menu được tick trong Cấu hình.
// Layout chỉ dựng khung; từng trang tự chặn bằng requirePageUser("admin") hoặc requireMenu(...).
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePageUser();
  return (
    <AppShell {...navFor(user.actor)} userName={user.name}>
      {children}
    </AppShell>
  );
}
