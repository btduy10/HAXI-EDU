import { describe, expect, it } from "vitest";
import { TEACHER_DARKEST, TEACHER_LIGHTEST, TEACHER_TONES, teacherLightness, teacherShade } from "@/domain/timetable-colors";

const hueOf = (shade: string) => Number(shade.slice(0, -1).split(" ")[2]);

describe("màu theo giáo viên trên Thời khóa biểu", () => {
  it("ba giáo viên liền mã nhận ba tông khác nhau, vòng sau lặp lại đúng thứ tự tông", () => {
    const hues = Array.from({ length: 6 }, (_, i) => hueOf(teacherShade(i, 6)));
    expect(new Set(hues.slice(0, TEACHER_TONES)).size).toBe(TEACHER_TONES);
    expect(hues.slice(TEACHER_TONES)).toEqual(hues.slice(0, TEACHER_TONES));
  });

  it("cùng một vòng thì cùng độ sáng; vòng sau đậm hơn, chia đều từ nhạt nhất tới đậm nhất", () => {
    const levels = Array.from({ length: 9 }, (_, i) => teacherLightness(i, 9));
    expect(levels.slice(0, 3)).toEqual([TEACHER_LIGHTEST, TEACHER_LIGHTEST, TEACHER_LIGHTEST]);
    expect(levels.slice(6)).toEqual([TEACHER_DARKEST, TEACHER_DARKEST, TEACHER_DARKEST]);
    expect(levels[3]).toBeCloseTo((TEACHER_LIGHTEST + TEACHER_DARKEST) / 2);
    expect(levels[3]).toBe(levels[5]);
  });

  it("mỗi giáo viên một màu riêng", () => {
    const shades = Array.from({ length: 9 }, (_, i) => teacherShade(i, 9));
    expect(new Set(shades).size).toBe(9);
  });

  it("chỉ một vòng thì dùng mức giữa; thứ tự ngoài khoảng được kẹp về hai đầu", () => {
    expect(teacherLightness(0, 1)).toBeCloseTo((TEACHER_LIGHTEST + TEACHER_DARKEST) / 2);
    expect(teacherLightness(2, 3)).toBeCloseTo((TEACHER_LIGHTEST + TEACHER_DARKEST) / 2);
    expect(teacherLightness(-1, 6)).toBe(TEACHER_LIGHTEST);
    expect(teacherLightness(9, 6)).toBe(TEACHER_DARKEST);
    expect(teacherShade(9, 6)).toBe(teacherShade(5, 6));
  });
});
