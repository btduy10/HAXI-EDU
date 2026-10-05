// Quy tắc thuần của sao, cấp bậc và avatar.

export type Level = { id: string; levelNo: number; name: string; minStars: number; frameColor: string };
export type AvatarRule = {
  id: string;
  name: string;
  /** Cấp yêu cầu (level_no); null với avatar tặng riêng. */
  requiredLevelNo: number | null;
  unlockType: "by_level" | "gifted";
  active: boolean;
};

/** Tổng sao hiển thị không bao giờ âm: GREATEST(0, SUM(stars)). */
export const clampTotal = (sum: number) => Math.max(0, sum);

/** Cấp hiện tại suy ra trực tiếp từ tổng sao toàn thời gian: bậc cao nhất có min_stars ≤ tổng. */
export function levelFor(total: number, levels: Level[]): Level {
  const sorted = [...levels].sort((a, b) => a.minStars - b.minStars);
  if (sorted.length === 0) throw new Error("Chưa cấu hình cấp bậc");
  let current = sorted[0]!;
  for (const level of sorted) if (level.minStars <= total) current = level;
  return current;
}

export type Progress = {
  total: number;
  level: Level;
  next: Level | null;
  /** Số sao còn thiếu để lên cấp; 0 khi đã ở cấp cao nhất. */
  starsToNext: number;
  /** 0–100, tiến độ trong cấp hiện tại. */
  percent: number;
};

export function progressFor(rawSum: number, levels: Level[]): Progress {
  const total = clampTotal(rawSum);
  const level = levelFor(total, levels);
  const next = [...levels].sort((a, b) => a.minStars - b.minStars).find((l) => l.minStars > total) ?? null;
  if (!next) return { total, level, next: null, starsToNext: 0, percent: 100 };
  const span = next.minStars - level.minStars;
  return {
    total,
    level,
    next,
    starsToNext: next.minStars - total,
    percent: Math.min(100, Math.max(0, Math.round(((total - level.minStars) / span) * 100))),
  };
}

/**
 * Avatar dùng được khi đang kích hoạt và: (a) mở theo cấp với cấp yêu cầu ≤ cấp hiện tại,
 * hoặc (b) được Admin tặng riêng cho học viên (không mất khi tụt cấp).
 */
export function isAvatarUnlocked(avatar: AvatarRule, levelNo: number, giftedIds: ReadonlySet<string>): boolean {
  if (!avatar.active) return false;
  if (giftedIds.has(avatar.id)) return true;
  return avatar.unlockType === "by_level" && avatar.requiredLevelNo !== null && avatar.requiredLevelNo <= levelNo;
}

/** Avatar theo cấp cao nhất còn mở (dùng khi avatar đang dùng bị khóa hoặc học viên chưa có avatar). */
export function fallbackAvatar(avatars: AvatarRule[], levelNo: number): AvatarRule | null {
  const open = avatars
    .filter((a) => a.active && a.unlockType === "by_level" && a.requiredLevelNo !== null && a.requiredLevelNo <= levelNo)
    .sort((a, b) => b.requiredLevelNo! - a.requiredLevelNo! || a.name.localeCompare(b.name, "vi"));
  return open[0] ?? null;
}

/**
 * Avatar học viên nên dùng sau khi tổng sao thay đổi.
 * Giữ nguyên nếu avatar hiện tại còn mở; nếu bị khóa (hoặc chưa có) thì chuyển sang avatar cao nhất còn mở.
 */
export function resolveAvatar(
  currentId: string | null,
  avatars: AvatarRule[],
  levelNo: number,
  giftedIds: ReadonlySet<string>,
): { avatarId: string | null; switched: boolean } {
  const current = currentId ? avatars.find((a) => a.id === currentId) : undefined;
  if (current && isAvatarUnlocked(current, levelNo, giftedIds)) return { avatarId: current.id, switched: false };
  const next = fallbackAvatar(avatars, levelNo);
  return { avatarId: next?.id ?? null, switched: (next?.id ?? null) !== currentId };
}

/**
 * Giới hạn trừ sao: mỗi học viên bị trừ tối đa `max` sao trong một buổi.
 * `usedPenalty` là tổng sao đã trừ trong buổi (không tính các lần đã hoàn tác).
 */
export function canDeduct(stars: number, usedPenalty: number, max: number): boolean {
  return stars >= 0 || usedPenalty + Math.abs(stars) <= max;
}

/** Bảng cấp hợp lệ: số cấp liên tục từ 1, cấp 1 bắt đầu từ 0 sao, mốc sao tăng dần. */
export function validateLevels(levels: Pick<Level, "levelNo" | "minStars">[]): string | null {
  const sorted = [...levels].sort((a, b) => a.levelNo - b.levelNo);
  if (sorted.length === 0) return "Phải có ít nhất một cấp.";
  if (sorted[0]!.levelNo !== 1 || sorted[0]!.minStars !== 0) return "Cấp 1 phải bắt đầu từ 0 sao.";
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i]!.levelNo !== sorted[i - 1]!.levelNo + 1) return "Số thứ tự cấp phải liên tục.";
    if (sorted[i]!.minStars <= sorted[i - 1]!.minStars) return "Mốc sao của cấp sau phải lớn hơn cấp trước.";
  }
  return null;
}
