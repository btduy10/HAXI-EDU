import { describe, expect, it } from "vitest";
import { ROSTER_ROWS, rosterSessionLabel, rosterSessionOrder, rosterTime, shiftOfTime } from "@/domain/roster";

describe("bảng tổng quan Ghi danh theo buổi", () => {
  it("tên buổi ghép ca với thứ, Chủ nhật là thứ 7 của tuần", () => {
    expect(rosterSessionLabel("Ca tối", 1)).toBe("Tối Thứ 2");
    expect(rosterSessionLabel("Ca sáng", 6)).toBe("Sáng Thứ 7");
    expect(rosterSessionLabel("Ca chiều", 7)).toBe("Chiều Chủ nhật");
    expect(ROSTER_ROWS).toBe(8);
  });

  it("giờ trên tiêu đề viết kiểu 19h00; buổi không gắn ca suy ca theo giờ bắt đầu", () => {
    expect(rosterTime("19:00:00")).toBe("19h00");
    expect(rosterTime("08:05")).toBe("08h05");
    expect(shiftOfTime("08:00:00")).toBe("Ca sáng");
    expect(shiftOfTime("11:59:00")).toBe("Ca sáng");
    expect(shiftOfTime("12:00:00")).toBe("Ca chiều");
    expect(shiftOfTime("16:30")).toBe("Ca chiều");
    expect(shiftOfTime("17:00:00")).toBe("Ca tối");
  });

  it("thứ tự: các buổi Tối từ Thứ 2 đến Chủ nhật, rồi Sáng Thứ 7, Chiều Thứ 7, Sáng Chủ nhật, Chiều Chủ nhật", () => {
    const sessions: [string, number][] = [
      ["Ca chiều", 7],
      ["Ca sáng", 7],
      ["Ca tối", 7],
      ["Ca chiều", 6],
      ["Ca tối", 3],
      ["Ca sáng", 6],
      ["Ca tối", 1],
      ["Ca tối", 6],
    ];
    const ordered = sessions.sort((a, b) => rosterSessionOrder(...a) - rosterSessionOrder(...b)).map((s) => rosterSessionLabel(...s));
    expect(ordered).toEqual([
      "Tối Thứ 2",
      "Tối Thứ 4",
      "Tối Thứ 7",
      "Tối Chủ nhật",
      "Sáng Thứ 7",
      "Chiều Thứ 7",
      "Sáng Chủ nhật",
      "Chiều Chủ nhật",
    ]);
  });
});
