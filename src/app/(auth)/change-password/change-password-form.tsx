"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { hardNavigate } from "@/lib/navigate";
import { password as passwordRule } from "@/lib/validation/entities";

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const currentPassword = String(form.get("currentPassword") ?? "");
    const newPassword = String(form.get("newPassword") ?? "");
    const check = passwordRule.safeParse(newPassword);
    if (!check.success) return setError(check.error.issues[0]?.message ?? "Mật khẩu không hợp lệ.");
    if (newPassword !== String(form.get("confirmPassword") ?? "")) return setError("Mật khẩu nhập lại không khớp.");
    if (newPassword === currentPassword) return setError("Mật khẩu mới phải khác mật khẩu hiện tại.");

    setPending(true);
    setError(null);
    const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
    if (result.error) {
      setError(authErrorMessage(result.error));
      setPending(false);
      return;
    }
    hardNavigate("/");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đổi mật khẩu</CardTitle>
        <CardDescription>
          {forced
            ? "Bạn đang dùng mật khẩu tạm. Hãy đặt mật khẩu mới (tối thiểu 8 ký tự, có cả chữ và số) để tiếp tục."
            : "Tối thiểu 8 ký tự, có cả chữ và số."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="currentPassword">Mật khẩu hiện tại</Label>
            <Input id="currentPassword" name="currentPassword" type="password" autoComplete="current-password" required className="h-11" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="newPassword">Mật khẩu mới</Label>
            <Input id="newPassword" name="newPassword" type="password" autoComplete="new-password" required className="h-11" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="confirmPassword">Nhập lại mật khẩu mới</Label>
            <Input id="confirmPassword" name="confirmPassword" type="password" autoComplete="new-password" required className="h-11" />
          </div>
          <Button type="submit" disabled={pending} className="h-11">
            {pending ? "Đang lưu…" : "Lưu mật khẩu"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
