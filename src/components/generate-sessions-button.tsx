"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { LinkButton } from "@/components/link-button";
import { formatDate } from "@/lib/format";
import { generateSessionsAction } from "@/server/actions/schedule";

type Result = {
  created: number;
  alreadyExisting: number;
  conflicts: { date: string; startTime: string; reason: string }[];
  warnings: string[];
};

export function GenerateSessionsButton({
  classId,
  disabled,
  timetableHref,
}: {
  classId: string;
  disabled?: boolean;
  /** Thời khóa biểu lọc theo lớp, mở đúng tuần có buổi sắp tới (trang tính lại sau khi sinh buổi). */
  timetableHref?: string;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const response = await generateSessionsAction({ classId });
      if (!response.ok) return void toast.error(response.error);
      setResult(response.data);
      toast.success(`Đã sinh ${response.data.created} buổi học.`);
    });
  }

  return (
    <div className="grid gap-2">
      <Button className="h-10 w-fit" disabled={pending || disabled} onClick={run}>
        {pending ? "Đang sinh buổi…" : "Sinh buổi học từ lịch mẫu"}
      </Button>
      {result && (
        <Alert variant={result.conflicts.length > 0 ? "destructive" : "default"}>
          <AlertTitle>
            Tạo mới {result.created} buổi · đã có sẵn {result.alreadyExisting} buổi · bỏ qua do trùng lịch {result.conflicts.length} buổi
          </AlertTitle>
          {(result.conflicts.length > 0 || result.warnings.length > 0) && (
            <AlertDescription>
              <ul className="list-disc pl-4">
                {result.warnings.map((w) => (
                  <li key={w}>Cảnh báo: {w}</li>
                ))}
                {result.conflicts.slice(0, 20).map((c) => (
                  <li key={`${c.date}-${c.startTime}`}>
                    {formatDate(c.date)} {c.startTime}: {c.reason}
                  </li>
                ))}
                {result.conflicts.length > 20 && <li>… và {result.conflicts.length - 20} buổi khác</li>}
              </ul>
            </AlertDescription>
          )}
          {timetableHref && (
            <AlertDescription>
              <LinkButton variant="outline" className="mt-2 h-9 w-fit" href={timetableHref}>
                Xem trên Thời khóa biểu
              </LinkButton>
            </AlertDescription>
          )}
        </Alert>
      )}
    </div>
  );
}
