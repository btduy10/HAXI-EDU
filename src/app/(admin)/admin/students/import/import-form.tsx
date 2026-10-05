"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Row = { rowNumber: number; code: string; fullName: string; errors: string[]; data: unknown | null };
type Preview = { rows: Row[]; validCount: number; errorCount: number; inserted?: number };
type ApiResult = { ok: true; data: Preview } | { ok: false; error: string };

export function ImportForm() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function send(mode: "preview" | "commit") {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError("Chưa chọn tệp.");
    const body = new FormData();
    body.set("file", file);
    setPending(true);
    setError(null);
    try {
      const response = await fetch(`/api/import/students?mode=${mode}`, { method: "POST", body });
      const result = (await response.json()) as ApiResult;
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPreview(result.data);
      if (mode === "commit") {
        setDone(true);
        toast.success(`Đã nhập ${result.data.inserted ?? 0} học viên.`);
      }
    } catch {
      setError("Không gửi được tệp. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="grid max-w-3xl gap-4">
      <div>
        <h1 className="text-lg font-semibold">Nhập học viên từ Excel</h1>
        <p className="text-sm text-muted-foreground">
          Tệp .xlsx tối đa 2 MB, 500 dòng. Dòng đầu là tiêu đề cột.{" "}
          <a href="/api/import/students" className="underline underline-offset-2">
            Tải tệp mẫu
          </a>
        </p>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="file">Tệp Excel</Label>
        <Input
          id="file"
          ref={fileRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="h-11"
          onChange={() => {
            setPreview(null);
            setDone(false);
            setError(null);
          }}
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2">
        <Button className="h-10" variant="outline" disabled={pending} onClick={() => send("preview")}>
          {pending && !preview ? "Đang kiểm tra…" : "Xem trước"}
        </Button>
        {preview && !done && preview.validCount > 0 && (
          <Button className="h-10" disabled={pending} onClick={() => send("commit")}>
            {pending ? "Đang nhập…" : `Nhập ${preview.validCount} dòng hợp lệ`}
          </Button>
        )}
        <Button className="h-10" variant="ghost" nativeButton={false} render={<Link href="/admin/students" />}>
          Về danh sách
        </Button>
      </div>

      {preview && (
        <div className="grid gap-2">
          <p className="text-sm">
            {done ? "Kết quả: " : "Xem trước: "}
            <strong>{preview.validCount}</strong> dòng hợp lệ, <strong>{preview.errorCount}</strong> dòng lỗi
            {preview.errorCount > 0 && !done && " (dòng lỗi sẽ bị bỏ qua)"}.
          </p>
          <ul className="grid gap-2">
            {preview.rows.map((row) => (
              <li key={row.rowNumber} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-muted-foreground">Dòng {row.rowNumber}</span>
                  <span className="font-medium break-words">
                    {row.code || "(thiếu mã)"} – {row.fullName || "(thiếu tên)"}
                  </span>
                  <Badge variant={row.errors.length ? "destructive" : "secondary"}>
                    {row.errors.length ? "Lỗi" : "Hợp lệ"}
                  </Badge>
                </div>
                {row.errors.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-destructive">
                    {row.errors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
