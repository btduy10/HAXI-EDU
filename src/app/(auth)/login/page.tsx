import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, homeOf, pendingStep } from "@/server/session";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Đăng nhập" };

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect(pendingStep(user) ?? homeOf(user));
  return <LoginForm />;
}
