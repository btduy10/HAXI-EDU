import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-8">
      {/* Form nằm trên một tấm kính gần đặc đặt trên nền chung của ứng dụng. */}
      {/* Logo và dòng giới thiệu nằm chung một tấm nền sáng: ảnh nền có vùng xanh đậm, chữ không đặt trực tiếp lên ảnh. */}
      <div className="relative mb-5 flex flex-col items-center gap-2 rounded-3xl bg-white/88 px-6 py-4 text-center shadow-[0_10px_30px_-18px_var(--foreground)]">
        <BrandLogo height={112} />
        <p className="text-sm font-semibold text-muted-foreground">Hệ thống quản lý trung tâm Robotics</p>
      </div>
      <div className="relative w-full max-w-sm [&_[data-slot=card]]:bg-white/88 [&_[data-slot=card]]:glass-blur">{children}</div>
    </main>
  );
}
