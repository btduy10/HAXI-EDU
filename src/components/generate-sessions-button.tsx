"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { generateSessionsAction } from "@/server/actions/schedule";

type Result = {
  created: number;
  alreadyExisting: number;
  warnings: string[];
  courseSessions?: number;
  scheduled?: number;
  removed?: number;
};

export function GenerateSessionsButton({
  classId,
  disabled,
}: {
  classId: string;
  disabled?: boolean;
}) {
  const [result, setResult] = useState<Result | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    if (
      !window.confirm(
        "Xếp lại lịch của lớp theo lịch mẫu? Các buổi chưa dạy (kể cả buổi xếp tay, buổi đã sửa riêng) được xếp lại đúng thứ, ca, giáo viên của lịch mẫu cho đủ số buổi khóa học. Buổi đã điểm danh, đã ghi sao và buổi đã hủy giữ nguyên.",
      )
    )
      return;
    startTransition(async () => {
      const response = await generateSessionsAction({ classId });
      if (!response.ok) return void toast.error(response.error);
      setResult(response.data);
      toast.success(`Đã tạo mới ${response.data.created} buổi theo lịch.`);
    });
  }

  return (
    <div className="grid gap-2">
      <Button className="h-10 w-fit" disabled={pending || disabled} onClick={run}>
        {pending ? "Đang sinh buổi…" : "Sinh buổi học từ lịch mẫu"}
      </Button>
      {result && (
        <Alert>
          <AlertTitle>Đã tạo mới {result.created} buổi theo lịch.</AlertTitle>
          <AlertDescription>
            {result.courseSessions !== undefined && result.scheduled !== undefined && (
              <p>
                Lớp có {result.scheduled}/{result.courseSessions} buổi theo khóa học
                {result.scheduled > result.created && ` (giữ ${result.scheduled - result.created} buổi đã dạy)`}. Xem các buổi ở menu Thời
                khóa biểu.
              </p>
            )}
          </AlertDescription>
          {result.warnings.length > 0 && (
            <AlertDescription>
              <ul className="list-disc pl-4">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </AlertDescription>
          )}
        </Alert>
      )}
    </div>
  );
}
