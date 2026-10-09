import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { connection } from "next/server";
import { AppBackground } from "@/components/app-background";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Be Vietnam Pro: thiết kế riêng cho tiếng Việt, dấu rõ và cân ở mọi độ đậm.
// Font này không có bản variable nên mỗi độ đậm là một tệp: chỉ nạp 400/500/600 cho nhẹ, chữ đậm (bold) dùng nét 600.
const font = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "HAXI STEM", template: "%s · HAXI STEM" },
  description: "Hệ thống quản lý Trung tâm Robotics",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP dùng nonce theo từng request nên mọi trang phải render động.
  await connection();
  return (
    <html lang="vi" className={`${font.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AppBackground />
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
