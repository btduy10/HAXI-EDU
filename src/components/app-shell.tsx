"use client";

import {
  BookOpenIcon,
  BotIcon,
  Building2Icon,
  ClipboardListIcon,
  GraduationCapIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  type LucideIcon,
  MenuIcon,
  SchoolIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { hardNavigate } from "@/lib/navigate";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

// Chỉ liệt kê các mục đã có ở giai đoạn hiện tại.
const NAV: Record<"admin" | "teacher", NavItem[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Tổng quan", icon: LayoutDashboardIcon },
    { href: "/admin/students", label: "Học viên", icon: GraduationCapIcon },
    { href: "/admin/teachers", label: "Giáo viên", icon: UsersIcon },
    { href: "/admin/courses", label: "Khóa học", icon: BookOpenIcon },
    { href: "/admin/classes", label: "Lớp học", icon: SchoolIcon },
    { href: "/admin/rooms-slots", label: "Phòng & Ca học", icon: Building2Icon },
    { href: "/admin/enrollments", label: "Ghi danh", icon: ClipboardListIcon },
    { href: "/admin/accounts", label: "Tài khoản", icon: UserCogIcon },
  ],
  teacher: [
    { href: "/teacher/dashboard", label: "Tổng quan", icon: LayoutDashboardIcon },
    { href: "/teacher/classes", label: "Lớp của tôi", icon: SchoolIcon },
  ],
};

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1 p-2">
      {items.map(({ href, label, icon: Icon }) => {
        const active = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              active ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function AccountLinks({ userName }: { userName: string }) {
  async function signOut() {
    await authClient.signOut();
    hardNavigate("/login");
  }
  return (
    <div className="grid gap-1 border-t p-2">
      <p className="truncate px-3 py-1 text-xs text-muted-foreground">{userName}</p>
      <Link href="/change-password" className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm hover:bg-muted">
        <KeyRoundIcon className="size-4" aria-hidden />
        Đổi mật khẩu
      </Link>
      <button type="button" onClick={signOut} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-muted">
        <LogOutIcon className="size-4" aria-hidden />
        Đăng xuất
      </button>
    </div>
  );
}

export function AppShell({
  role,
  userName,
  children,
}: {
  role: "admin" | "teacher";
  userName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const items = NAV[role];
  const brand = (
    <span className="flex items-center gap-2 font-semibold">
      <BotIcon className="size-5" aria-hidden />
      HAXI Robotics
    </span>
  );

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background px-3 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Mở menu" />}>
            <MenuIcon />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-0 p-0">
            <SheetHeader className="border-b">
              <SheetTitle>{brand}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </div>
            <AccountLinks userName={userName} />
          </SheetContent>
        </Sheet>
        {brand}
      </header>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r md:flex">
        <div className="flex h-14 items-center border-b px-4">{brand}</div>
        <div className="flex-1 overflow-y-auto">
          <NavLinks items={items} />
        </div>
        <AccountLinks userName={userName} />
      </aside>

      <main className="min-w-0 flex-1 p-3 sm:p-6">{children}</main>
    </div>
  );
}
