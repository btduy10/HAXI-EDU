import { BrandLogo } from "@/components/brand-logo";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-4 py-8">
      {/* Form nằm trên một tấm kính gần đặc đặt trên nền chung của ứng dụng. */}
      <div className="page-enter relative mb-5 flex flex-col items-center gap-2 text-center">
        <span className="rounded-3xl bg-white/85 px-5 py-3 shadow-[0_10px_30px_-18px_var(--foreground)]">
          <BrandLogo height={112} />
        </span>
        <p className="text-sm font-semibold text-foreground/80">Hệ thống quản lý trung tâm Robotics</p>
      </div>
      <div className="page-enter relative w-full max-w-sm [&_[data-slot=card]]:bg-white/88 [&_[data-slot=card]]:glass-blur">{children}</div>
    </main>
  );
}
