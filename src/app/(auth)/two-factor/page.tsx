"use client";

import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { hardNavigate } from "@/lib/navigate";

export default function TwoFactorPage() {
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(null);
    const result = useBackup
      ? await authClient.twoFactor.verifyBackupCode({ code })
      : await authClient.twoFactor.verifyTotp({ code });
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
        <CardTitle>Xác thực hai lớp</CardTitle>
        <CardDescription>
          {useBackup ? "Nhập một mã dự phòng chưa dùng." : "Nhập mã 6 số trong ứng dụng xác thực của bạn."}
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
            <Label htmlFor="code">{useBackup ? "Mã dự phòng" : "Mã xác thực"}</Label>
            <Input
              id="code"
              name="code"
              key={useBackup ? "backup" : "totp"}
              inputMode={useBackup ? "text" : "numeric"}
              autoComplete="one-time-code"
              autoFocus
              required
              className="h-11 text-center text-lg tracking-widest"
            />
          </div>
          <Button type="submit" disabled={pending} className="h-11">
            {pending ? "Đang kiểm tra…" : "Xác nhận"}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setUseBackup((v) => !v)}>
            {useBackup ? "Dùng mã từ ứng dụng" : "Dùng mã dự phòng"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
