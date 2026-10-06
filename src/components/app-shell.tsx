"use client";

import {
  BarChart3Icon,
  BookOpenIcon,
  Building2Icon,
  CalendarCheckIcon,
  CalendarDaysIcon,
  ClipboardCheckIcon,
  ClipboardListIcon,
  GiftIcon,
  GraduationCapIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  type LucideIcon,
  MenuIcon,
  SchoolIcon,
  ScrollTextIcon,
  SettingsIcon,
  StarIcon,
  UserCogIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { hardNavigate } from "@/lib/navigate";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: LucideIcon };

// Toàn bộ mục menu. Máy chủ quyết định người dùng thấy mục nào (theo vai trò và bảng phân quyền).
const NAV: Record<"admin" | "teacher", NavItem[]> = {
  admin: [
    { href: "/admin/dashboard", label: "Tổng quan", icon: LayoutDashboardIcon },
    { href: "/admin/students", label: "Học viên", icon: GraduationCapIcon },
    { href: "/admin/teachers", label: "Giáo viên", icon: UsersIcon },
    { href: "/admin/courses", label: "Khóa học", icon: BookOpenIcon },
    { href: "/admin/classes", label: "Lớp học", icon: SchoolIcon },
    { href: "/admin/rooms-slots", label: "Phòng & Ca học", icon: Building2Icon },
    { href: "/admin/enrollments", label: "Ghi danh", icon: ClipboardListIcon },
    { href: "/admin/timetable", label: "Thời khóa biểu", icon: CalendarDaysIcon },
    { href: "/admin/attendance", label: "Điểm danh", icon: ClipboardCheckIcon },
    { href: "/admin/stars", label: "Sao & Avatar", icon: StarIcon },
    { href: "/admin/rewards", label: "Quà & Tổng kết", icon: GiftIcon },
    { href: "/admin/timesheet", label: "Chấm công", icon: CalendarCheckIcon },
    { href: "/admin/reports", label: "Báo cáo", icon: BarChart3Icon },
    { href: "/admin/accounts", label: "Tài khoản", icon: UserCogIcon },
    { href: "/admin/audit", label: "Nhật ký", icon: ScrollTextIcon },
    { href: "/admin/settings", label: "Cấu hình", icon: SettingsIcon },
  ],
  teacher: [
    { href: "/teacher/dashboard", label: "Tổng quan", icon: LayoutDashboardIcon },
    { href: "/teacher/timetable", label: "TKB của tôi", icon: CalendarDaysIcon },
    { href: "/teacher/classes", label: "Lớp của tôi", icon: SchoolIcon },
  ],
};

// Chỉ tải trước trang khi người dùng rê chuột/chạm vào mục menu, thay vì tải trước cả menu ở mỗi lần mở trang.
function NavLink({ item, active, onNavigate }: { item: NavItem; active: boolean; onNavigate?: () => void }) {
  const [intent, setIntent] = useState(false);
  const { href, label, icon: Icon } = item;
  return (
    <Link
      href={href}
      prefetch={intent ? null : false}
      onMouseEnter={() => setIntent(true)}
      onTouchStart={() => setIntent(true)}
      onFocus={() => setIntent(true)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
        active ? "bg-sidebar-primary font-bold text-sidebar-primary-foreground" : "hover:bg-sidebar-accent",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {label}
    </Link>
  );
}

function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="grid gap-1 p-2">
      {items.map((item) => (
        <NavLink key={item.href} item={item} active={pathname === item.href || pathname.startsWith(`${item.href}/`)} onNavigate={onNavigate} />
      ))}
    </nav>
  );
}

function AccountLinks({ userName }: { userName: string }) {
  async function signOut() {
    await authClient.signOut();
    hardNavigate("/login");
  }
  return (
    <div className="grid gap-1 border-t border-sidebar-border p-2">
      <p className="truncate px-3 py-1 text-xs text-sidebar-foreground/70">{userName}</p>
      <Link href="/change-password" className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm hover:bg-sidebar-accent">
        <KeyRoundIcon className="size-4" aria-hidden />
        Đổi mật khẩu
      </Link>
      <button type="button" onClick={signOut} className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-left text-sm hover:bg-sidebar-accent">
        <LogOutIcon className="size-4" aria-hidden />
        Đăng xuất
      </button>
    </div>
  );
}

export function AppShell({
  hrefs,
  labels,
  userName,
  children,
}: {
  /** Các mục menu được hiện, do máy chủ tính (xem `navFor`). */
  hrefs: string[];
  /** Nhãn thay thế theo href (vd. "Lớp của tôi" → "Lớp học" khi được xem mọi lớp). */
  labels?: Record<string, string>;
  userName: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const items = [...NAV.teacher, ...NAV.admin]
    .filter((item) => hrefs.includes(item.href))
    .map((item) => ({ ...item, label: labels?.[item.href] ?? item.label }));
  // Logo có chữ màu navy nên phần đầu thanh điều hướng giữ nền trắng.
  const sidebarBrand = (
    <div className="flex items-center gap-3 bg-white px-4 py-3 text-foreground">
      <BrandLogo height={56} />
      <span className="text-sm leading-tight font-semibold text-muted-foreground">
        Quản lý
        <br />
        trung tâm Robotics
      </span>
    </div>
  );

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-white px-3 md:hidden">
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger render={<Button variant="ghost" size="icon" aria-label="Mở menu" />}>
            <MenuIcon />
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground">
            <SheetHeader className="p-0">
              <SheetTitle>{sidebarBrand}</SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto">
              <NavLinks items={items} onNavigate={() => setOpen(false)} />
            </div>
            <AccountLinks userName={userName} />
          </SheetContent>
        </Sheet>
        <BrandLogo height={40} />
      </header>

      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        {sidebarBrand}
        <div className="flex-1 overflow-y-auto">
          <NavLinks items={items} />
        </div>
        <AccountLinks userName={userName} />
      </aside>

      <main className="min-w-0 flex-1 p-3 sm:p-6">{children}</main>
    </div>
  );
}
