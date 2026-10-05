"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { approveRewardsAction, cancelApprovalAction, markGiftGivenAction } from "@/server/actions/rewards";

type Row = {
  summaryId: string;
  code: string;
  fullName: string;
  totalStars: number;
  attendanceRate: number;
  rank: number;
  proposedGift: string | null;
  handover: { id: string; giftName: string; status: "pending" | "given"; givenLabel: string | null } | null;
};

/** Bảng tổng kết: hệ thống đề xuất quà theo mốc → Admin chọn và duyệt → ghi nhận đã trao. */
export function RewardApproval({ classId, rows }: { classId: string; rows: Row[] }) {
  const eligible = rows.filter((r) => r.proposedGift && !r.handover);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(eligible.map((r) => r.summaryId)));
  const [pending, startTransition] = useTransition();
  const chosen = eligible.filter((r) => selected.has(r.summaryId));

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  function run(action: () => Promise<{ ok: true; data: unknown } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await action();
      if (result.ok) toast.success(success);
      else toast.error(result.error, { duration: 8000 });
    });
  }

  return (
    <div className="grid gap-3">
      {eligible.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/40 p-3 text-sm">
          <p>
            Hệ thống đề xuất <strong>{eligible.length}</strong> học viên đủ điều kiện nhận quà. Bỏ chọn những em không duyệt.
          </p>
          <Button
            className="h-10"
            disabled={pending || chosen.length === 0}
            onClick={() =>
              run(
                () => approveRewardsAction({ classId, summaryIds: chosen.map((r) => r.summaryId) }),
                `Đã duyệt quà cho ${chosen.length} học viên.`,
              )
            }
          >
            Duyệt {chosen.length} học viên
          </Button>
        </div>
      )}

      <ul className="grid gap-2">
        {rows.map((r) => (
          <li key={r.summaryId} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <p className="font-medium break-words">
                <span className="text-muted-foreground">#{r.rank}</span> {r.fullName} <span className="font-normal text-muted-foreground">{r.code}</span>
              </p>
              <p className="text-muted-foreground">
                {r.totalStars} sao · chuyên cần {r.attendanceRate}%
                {(r.handover?.giftName ?? r.proposedGift) && (
                  <>
                    {" "}
                    · quà: <span className="text-foreground">{r.handover?.giftName ?? r.proposedGift}</span>
                  </>
                )}
              </p>
              {r.handover?.givenLabel && <p className="text-xs text-muted-foreground">{r.handover.givenLabel}</p>}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              {!r.handover && !r.proposedGift && <Badge variant="outline">Chưa đạt mốc quà</Badge>}
              {!r.handover && r.proposedGift && (
                <label className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 has-checked:bg-muted">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.has(r.summaryId)}
                    onChange={() => toggle(r.summaryId)}
                    aria-label={`Duyệt quà cho ${r.fullName}`}
                  />
                  Duyệt
                </label>
              )}
              {r.handover?.status === "pending" && (
                <>
                  <Badge variant="secondary">Đã duyệt</Badge>
                  <Button
                    className="h-9"
                    disabled={pending}
                    aria-label={`Ghi nhận đã trao quà cho ${r.fullName}`}
                    onClick={() => run(() => markGiftGivenAction({ handoverId: r.handover!.id }), `Đã ghi nhận trao quà cho ${r.fullName}.`)}
                  >
                    Đã trao
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-9"
                    disabled={pending}
                    aria-label={`Bỏ duyệt quà của ${r.fullName}`}
                    onClick={() => run(() => cancelApprovalAction({ handoverId: r.handover!.id }), "Đã bỏ duyệt.")}
                  >
                    Bỏ duyệt
                  </Button>
                </>
              )}
              {r.handover?.status === "given" && <Badge>Đã trao</Badge>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
