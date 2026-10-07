import { describe, expect, it } from "vitest";
import { orderSlotFrames } from "@/domain/time-slots";

describe("khung giờ của ca học", () => {
  it("gom theo ca; ca bắt đầu sớm đứng trước; trong ca, sắp theo số khung đã chọn", () => {
    const slots = [
      { name: "Ca tối", frame: 1, defaultStart: "18:00:00", defaultEnd: "19:30:00" },
      { name: "Ca chiều", frame: 2, defaultStart: "15:15:00", defaultEnd: "16:45:00" },
      { name: "Ca sáng", frame: 1, defaultStart: "08:00:00", defaultEnd: "09:30:00" },
      { name: "Ca chiều", frame: 1, defaultStart: "13:30:00", defaultEnd: "15:00:00" },
    ];
    expect(orderSlotFrames(slots).map((s) => [s.name, s.frame])).toEqual([
      ["Ca sáng", 1],
      ["Ca chiều", 1],
      ["Ca chiều", 2],
      ["Ca tối", 1],
    ]);
  });
});
