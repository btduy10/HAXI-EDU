import type { Metadata, Viewport } from "next";
import { Quicksand } from "next/font/google";
import { connection } from "next/server";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

// Quicksand: chữ bo tròn, thân thiện, có đủ dấu tiếng Việt.
const font = Quicksand({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["500", "600", "700"],
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
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
