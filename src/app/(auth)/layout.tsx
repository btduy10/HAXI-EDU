import { BotIcon } from "lucide-react";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-muted/40 px-4 py-8">
      <div className="mb-6 flex items-center gap-2 text-lg font-semibold">
        <BotIcon className="size-6" aria-hidden />
        HAXI Robotics
      </div>
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
