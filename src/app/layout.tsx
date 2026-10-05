import type { Metadata, Viewport } from "next";
import { Be_Vietnam_Pro } from "next/font/google";
import { connection } from "next/server";
import { Toaster } from "@/components/ui/sonner";
import "./globals.css";

const font = Be_Vietnam_Pro({
  variable: "--font-sans",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: { default: "HAXI Robotics", template: "%s · HAXI Robotics" },
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
