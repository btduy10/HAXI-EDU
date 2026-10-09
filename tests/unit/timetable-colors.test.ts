import { describe, expect, it } from "vitest";
import { EXTRA_LIGHTNESS, TEACHER_DARKEST, TEACHER_LIGHTEST, teacherLightness, teacherShade } from "@/domain/timetable-colors";

describe("màu theo giáo viên trên Thời khóa biểu", () => {
  it("giáo viên xếp trước nhạt hơn, các mức chia đều từ nhạt nhất tới đậm nhất", () => {
    const levels = [0, 1, 2, 3, 4].map((i) => teacherLightness(i, 5));
    expect(levels[0]).toBe(TEACHER_LIGHTEST);
    expect(levels[4]).toBe(TEACHER_DARKEST);
    for (let i = 1; i < levels.length; i++) expect(levels[i]!).toBeLessThan(levels[i - 1]!);
    // Độ sáng làm tròn tới phần nghìn nên các bước lệch nhau không quá một phần nghìn.
    const steps = levels.slice(1).map((level, i) => Math.round((levels[i]! - level) * 1000));
    expect(Math.max(...steps) - Math.min(...steps)).toBeLessThanOrEqual(1);
  });

  it("mỗi giáo viên một màu riêng; lớp học thêm đậm hơn mọi giáo viên", () => {
    const shades = Array.from({ length: 8 }, (_, i) => teacherShade(i, 8));
    expect(new Set(shades).size).toBe(8);
    for (let i = 0; i < 8; i++) expect(teacherLightness(i, 8)).toBeGreaterThan(EXTRA_LIGHTNESS);
  });

  it("chỉ một giáo viên thì dùng mức giữa; thứ tự ngoài khoảng được kẹp về hai đầu", () => {
    expect(teacherLightness(0, 1)).toBeCloseTo((TEACHER_LIGHTEST + TEACHER_DARKEST) / 2);
    expect(teacherLightness(-1, 4)).toBe(TEACHER_LIGHTEST);
    expect(teacherLightness(9, 4)).toBe(TEACHER_DARKEST);
  });
});
