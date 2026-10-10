import { describe, expect, it } from "vitest";
import { canDeduct, clampTotal } from "@/domain/stars";

describe("tổng sao", () => {
  it("tổng sao không bao giờ âm", () => {
    expect(clampTotal(-7)).toBe(0);
    expect(clampTotal(0)).toBe(0);
    expect(clampTotal(12)).toBe(12);
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
