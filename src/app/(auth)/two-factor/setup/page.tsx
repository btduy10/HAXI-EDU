import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser, homeOf } from "@/server/session";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Thiết lập xác thực hai lớp" };

export default async function TwoFactorSetupPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword) redirect("/change-password");
  if (user.twoFactorEnabled) redirect(homeOf(user));
  return <SetupForm required={user.role === "admin"} />;
}
