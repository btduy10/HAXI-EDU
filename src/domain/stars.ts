// Quy tắc thuần của sao.

/** Tổng sao hiển thị không bao giờ âm: GREATEST(0, SUM(stars)). */
export const clampTotal = (sum: number) => Math.max(0, sum);

/**
 * Giới hạn trừ sao: mỗi học viên bị trừ tối đa `max` sao trong một buổi.
 * `usedPenalty` là tổng sao đã trừ trong buổi (không tính các lần đã hoàn tác).
 */
export function canDeduct(stars: number, usedPenalty: number, max: number): boolean {
  return stars >= 0 || usedPenalty + Math.abs(stars) <= max;
}
