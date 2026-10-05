import { describe, expect, it } from "vitest";
import {
  type AvatarRule,
  type Level,
  canDeduct,
  clampTotal,
  fallbackAvatar,
  isAvatarUnlocked,
  levelFor,
  progressFor,
  resolveAvatar,
  validateLevels,
} from "@/domain/stars";

const levels: Level[] = [
  { id: "l1", levelNo: 1, name: "Tân binh", minStars: 0, frameColor: "#b08d57" },
  { id: "l2", levelNo: 2, name: "Kỹ sư tập sự", minStars: 20, frameColor: "#cd7f32" },
  { id: "l3", levelNo: 3, name: "Kỹ sư", minStars: 50, frameColor: "#c0c0c0" },
  { id: "l4", levelNo: 4, name: "Chuyên gia", minStars: 100, frameColor: "#ffd700" },
  { id: "l5", levelNo: 5, name: "Bậc thầy", minStars: 200, frameColor: "#e5b80b" },
];

const avatar = (id: string, requiredLevelNo: number | null, extra: Partial<AvatarRule> = {}): AvatarRule => ({
  id,
  name: id,
  requiredLevelNo,
  unlockType: requiredLevelNo === null ? "gifted" : "by_level",
  active: true,
  ...extra,
});
const avatars = [avatar("a1", 1), avatar("b1", 1), avatar("a2", 2), avatar("a3", 3), avatar("gift", null)];

describe("tổng sao và cấp bậc", () => {
  it("tổng sao không bao giờ âm", () => {
    expect(clampTotal(-7)).toBe(0);
    expect(clampTotal(0)).toBe(0);
    expect(clampTotal(12)).toBe(12);
    expect(progressFor(-7, levels)).toMatchObject({ total: 0, level: { levelNo: 1 }, starsToNext: 20, percent: 0 });
  });

  it("cấp suy ra trực tiếp từ tổng sao theo các mốc", () => {
    expect([0, 19, 20, 49, 50, 99, 100, 199, 200, 9999].map((t) => levelFor(t, levels).levelNo)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
  });

  it("tiến độ: còn X sao để lên cấp, cấp cao nhất thì đầy thanh", () => {
    expect(progressFor(35, levels)).toMatchObject({ total: 35, level: { levelNo: 2 }, next: { levelNo: 3 }, starsToNext: 15, percent: 50 });
    expect(progressFor(250, levels)).toMatchObject({ level: { levelNo: 5 }, next: null, starsToNext: 0, percent: 100 });
  });

  it("trừ sao làm tụt cấp ngay", () => {
    expect(levelFor(clampTotal(20), levels).levelNo).toBe(2);
    expect(levelFor(clampTotal(20 - 1), levels).levelNo).toBe(1);
  });

  it("kiểm tra bảng cấp hợp lệ", () => {
    expect(validateLevels(levels)).toBeNull();
    expect(validateLevels([{ levelNo: 1, minStars: 5 }])).toMatch(/0 sao/);
    expect(validateLevels([{ levelNo: 1, minStars: 0 }, { levelNo: 3, minStars: 10 }])).toMatch(/liên tục/);
    expect(validateLevels([{ levelNo: 1, minStars: 0 }, { levelNo: 2, minStars: 30 }, { levelNo: 3, minStars: 30 }])).toMatch(/lớn hơn/);
  });
});

describe("avatar", () => {
  it("mở theo cấp hoặc được tặng riêng; avatar tắt thì không dùng được", () => {
    expect(isAvatarUnlocked(avatar("x", 2), 2, new Set())).toBe(true);
    expect(isAvatarUnlocked(avatar("x", 3), 2, new Set())).toBe(false);
    expect(isAvatarUnlocked(avatar("gift", null), 1, new Set())).toBe(false);
    expect(isAvatarUnlocked(avatar("gift", null), 1, new Set(["gift"]))).toBe(true);
    expect(isAvatarUnlocked(avatar("x", 1, { active: false }), 5, new Set())).toBe(false);
  });

  it("avatar dự phòng là avatar theo cấp cao nhất còn mở", () => {
    expect(fallbackAvatar(avatars, 2)?.id).toBe("a2");
    expect(fallbackAvatar(avatars, 1)?.id).toBe("a1"); // cùng cấp thì theo tên
    expect(fallbackAvatar(avatars, 5)?.id).toBe("a3");
    expect(fallbackAvatar([avatar("gift", null)], 5)).toBeNull();
  });

  it("tụt cấp làm khóa avatar đang dùng → tự đổi; avatar còn mở hoặc được tặng thì giữ nguyên", () => {
    expect(resolveAvatar("a3", avatars, 3, new Set())).toEqual({ avatarId: "a3", switched: false });
    expect(resolveAvatar("a3", avatars, 2, new Set())).toEqual({ avatarId: "a2", switched: true });
    expect(resolveAvatar("a3", avatars, 1, new Set())).toEqual({ avatarId: "a1", switched: true });
    expect(resolveAvatar("gift", avatars, 1, new Set(["gift"]))).toEqual({ avatarId: "gift", switched: false });
    expect(resolveAvatar("gift", avatars, 1, new Set())).toEqual({ avatarId: "a1", switched: true });
    // Lên cấp không tự đổi avatar đang dùng.
    expect(resolveAvatar("a1", avatars, 3, new Set())).toEqual({ avatarId: "a1", switched: false });
    expect(resolveAvatar(null, avatars, 2, new Set())).toEqual({ avatarId: "a2", switched: true });
  });
});

describe("giới hạn trừ sao mỗi buổi", () => {
  it("thưởng không bị giới hạn; trừ không vượt quá N sao/buổi", () => {
    expect(canDeduct(5, 3, 3)).toBe(true);
    expect(canDeduct(-3, 0, 3)).toBe(true);
    expect(canDeduct(-1, 2, 3)).toBe(true);
    expect(canDeduct(-2, 2, 3)).toBe(false);
    expect(canDeduct(-1, 3, 3)).toBe(false);
    expect(canDeduct(-1, 0, 0)).toBe(false);
  });
});
