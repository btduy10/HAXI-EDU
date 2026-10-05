"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { hardNavigate } from "@/lib/navigate";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const result = await authClient.signIn.username({
      username: String(form.get("username") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (result.error) {
      setError(authErrorMessage(result.error));
      setPending(false);
      return;
    }
    // Tải lại toàn trang để máy chủ quyết định bước kế tiếp (đổi mật khẩu, 2FA, trang chủ).
    const needsTwoFactor = (result.data as { twoFactorRedirect?: boolean } | null)?.twoFactorRedirect;
    hardNavigate(needsTwoFactor ? "/two-factor" : "/");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Đăng nhập</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="grid gap-2">
            <Label htmlFor="username">Tên đăng nhập</Label>
            <Input id="username" name="username" autoComplete="username" autoCapitalize="none" required className="h-11" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="password">Mật khẩu</Label>
            <PasswordInput id="password" name="password" autoComplete="current-password" required className="h-11" />
          </div>
          <Button type="submit" disabled={pending} className="h-11">
            {pending ? "Đang đăng nhập…" : "Đăng nhập"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
