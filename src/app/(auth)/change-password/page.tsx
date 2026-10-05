import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Đổi mật khẩu" };

export default async function ChangePasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return <ChangePasswordForm forced={user.mustChangePassword} />;
}
