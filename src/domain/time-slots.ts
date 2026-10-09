import { SLOT_NAMES } from "@/lib/validation/entities";

/** Một khung giờ của ca học (một dòng time_slots). Giờ dạng "HH:MM" hoặc "HH:MM:SS". */
export type SlotFrame = { name: string; frame: number; defaultStart: string; defaultEnd: string };

/** Bậc nền của một ca trên Thời khóa biểu: 0 sáng nhất, đậm dần về cuối ngày. */
export type ShiftTone = 0 | 1 | 2;

/**
 * Ca sáng → 0, Ca chiều → 1, Ca tối → 2. Mọi khung của cùng một ca ra cùng bậc;
 * buổi không gắn ca hoặc tên ca lạ dùng bậc 0.
 */
export function shiftTone(name: string | null | undefined): ShiftTone {
  const index = (SLOT_NAMES as readonly string[]).indexOf(name ?? "");
  return (index < 0 ? 0 : Math.min(index, 2)) as ShiftTone;
}

/**
 * Sắp các khung giờ theo ca để hiển thị: ca có khung bắt đầu sớm hơn đứng trước;
 * trong cùng ca, theo số khung Admin chọn (Khung 1, Khung 2…).
 */
export function orderSlotFrames<T extends SlotFrame>(slots: T[]): T[] {
  const groups = new Map<string, T[]>();
  for (const slot of slots) groups.set(slot.name, [...(groups.get(slot.name) ?? []), slot]);
  const earliest = (list: T[]) => list.reduce((min, s) => (s.defaultStart < min ? s.defaultStart : min), list[0]!.defaultStart);
  return [...groups.values()]
    .map((list) => list.sort((a, b) => a.frame - b.frame))
    .sort((a, b) => earliest(a).localeCompare(earliest(b)) || a[0]!.name.localeCompare(b[0]!.name, "vi"))
    .flat();
}
