"use client";

import QRCode from "qrcode";
import { useState } from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/password-input";
import { Label } from "@/components/ui/label";
import { authClient, authErrorMessage } from "@/lib/auth-client";
import { hardNavigate } from "@/lib/navigate";

type Enrollment = { qr: string; secret: string; backupCodes: string[] };

export function SetupForm({ required }: { required: boolean }) {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function start(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(new FormData(event.currentTarget).get("password") ?? "");
    setPending(true);
    setError(null);
    const result = await authClient.twoFactor.enable({ password });
    setPending(false);
    if (result.error || !result.data || result.data.method !== "totp") return setError(authErrorMessage(result.error));
    const uri = result.data.totpURI;
    setEnrollment({
      qr: await QRCode.toDataURL(uri, { margin: 1, width: 220 }),
      secret: new URL(uri).searchParams.get("secret") ?? "",
      backupCodes: result.data.backupCodes,
    });
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
    setPending(true);
    setError(null);
    const result = await authClient.twoFactor.verifyTotp({ code });
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
        <CardTitle>Thiết lập xác thực hai lớp</CardTitle>
        <CardDescription>
          {required
            ? "Tài khoản quản trị bắt buộc dùng mã xác thực (TOTP) khi đăng nhập."
            : "Bảo vệ tài khoản bằng mã xác thực (TOTP) khi đăng nhập."}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {!enrollment ? (
          <form onSubmit={start} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="password">Nhập lại mật khẩu để tiếp tục</Label>
              <PasswordInput id="password" name="password" autoComplete="current-password" required className="h-11" />
            </div>
            <Button type="submit" disabled={pending} className="h-11">
              {pending ? "Đang tạo mã…" : "Tiếp tục"}
            </Button>
          </form>
        ) : (
          <form onSubmit={verify} className="grid gap-4">
            <p className="text-sm">1. Quét mã QR bằng Google Authenticator, Microsoft Authenticator hoặc ứng dụng tương tự.</p>
            {/* eslint-disable-next-line @next/next/no-img-element -- ảnh data: sinh tại trình duyệt */}
            <img src={enrollment.qr} alt="Mã QR thiết lập xác thực" width={220} height={220} className="mx-auto rounded-md border" />
            <p className="text-sm">
              Hoặc nhập khóa thủ công:{" "}
              <code data-testid="totp-secret" className="break-all rounded bg-muted px-1 py-0.5 text-xs">
                {enrollment.secret}
              </code>
            </p>
            <div className="grid gap-1 text-sm">
              <p>2. Lưu các mã dự phòng ở nơi an toàn (mỗi mã dùng một lần):</p>
              <ul className="grid grid-cols-2 gap-1 rounded-md bg-muted p-2 font-mono text-xs">
                {enrollment.backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="code">3. Nhập mã 6 số từ ứng dụng</Label>
              <Input
                id="code"
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                required
                className="h-11 text-center text-lg tracking-widest"
              />
            </div>
            <Button type="submit" disabled={pending} className="h-11">
              {pending ? "Đang kiểm tra…" : "Hoàn tất"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
