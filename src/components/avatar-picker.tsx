"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { AvatarBadge } from "@/components/avatar";
import { cn } from "@/lib/utils";
import { setStudentAvatarAction } from "@/server/actions/stars";

type Item = {
  id: string;
  name: string;
  svgPath: string;
  gifted: boolean;
  unlocked: boolean;
  requiredMinStars: number | null;
};

/** Lưới chọn avatar: avatar đã mở chọn được; avatar khóa hiển thị mờ kèm "cần X sao". */
export function AvatarPicker({
  studentId,
  currentId,
  frameColor,
  avatars,
}: {
  studentId: string;
  currentId: string | null;
  frameColor: string;
  avatars: Item[];
}) {
  const [pending, startTransition] = useTransition();

  function choose(avatar: Item) {
    startTransition(async () => {
      const result = await setStudentAvatarAction({ studentId, avatarId: avatar.id });
      if (result.ok) toast.success(`Đã đổi avatar thành "${avatar.name}".`);
      else toast.error(result.error);
    });
  }

  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
      {avatars.map((a) => {
        const current = a.id === currentId;
        return (
          <li key={a.id}>
            <button
              type="button"
              disabled={!a.unlocked || current || pending}
              aria-pressed={current}
              aria-label={`${a.name}${a.unlocked ? "" : `, đang khóa, cần ${a.requiredMinStars ?? "?"} sao`}`}
              onClick={() => choose(a)}
              className={cn(
                "flex w-full flex-col items-center gap-1.5 glass-solid rounded-xl border p-2 text-center text-xs transition-colors",
                current ? "border-primary bg-primary/10 ring-2 ring-primary" : a.unlocked ? "hover:bg-muted" : "cursor-not-allowed bg-muted/40",
              )}
            >
              <AvatarBadge avatar={a} frameColor={a.unlocked ? frameColor : "#d4d4d8"} size={52} locked={!a.unlocked} className="mt-1" />
              <span className="font-medium">{a.name}</span>
              <span className="text-muted-foreground">
                {current ? "Đang dùng" : a.gifted ? "Được tặng" : a.unlocked ? "Đã mở" : `Cần ${a.requiredMinStars ?? "?"} sao`}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
