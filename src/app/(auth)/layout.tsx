import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-4 py-8">
      {/* Mảng màu trang trí: xanh ngọc và vàng đồng của thương hiệu. */}
      <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-secondary" />
      <div aria-hidden className="pointer-events-none absolute -right-20 -bottom-28 size-80 rounded-full bg-brand-gold/15" />
      <div className="relative mb-5 flex flex-col items-center gap-2 text-center">
        <BrandLogo height={112} priority />
        <p className="text-sm font-semibold text-muted-foreground">Hệ thống quản lý trung tâm Robotics</p>
      </div>
      <div className="relative w-full max-w-sm">{children}</div>
    </main>
  );
}
