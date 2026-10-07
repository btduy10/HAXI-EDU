/** Một khung giờ của ca học (một dòng time_slots). Giờ dạng "HH:MM" hoặc "HH:MM:SS". */
export type SlotFrame = { name: string; frame: number; defaultStart: string; defaultEnd: string };

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
