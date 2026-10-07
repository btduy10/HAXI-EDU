import { describe, expect, it } from "vitest";
import { orderSlotFrames } from "@/domain/time-slots";

describe("khung giờ của ca học", () => {
  it("gom theo ca; ca bắt đầu sớm đứng trước; trong ca, khung kết thúc trước đứng trước và được đánh số Khung 1, 2…", () => {
    const slots = [
      { name: "Ca tối", defaultStart: "18:00:00", defaultEnd: "19:30:00" },
      { name: "Ca chiều", defaultStart: "15:15:00", defaultEnd: "16:45:00" },
      { name: "Ca sáng", defaultStart: "08:00:00", defaultEnd: "09:30:00" },
      { name: "Ca chiều", defaultStart: "13:30:00", defaultEnd: "15:00:00" },
    ];
    expect(orderSlotFrames(slots).map((s) => [s.name, s.frame, s.defaultEnd])).toEqual([
      ["Ca sáng", 1, "09:30:00"],
      ["Ca chiều", 1, "15:00:00"],
      ["Ca chiều", 2, "16:45:00"],
      ["Ca tối", 1, "19:30:00"],
    ]);
  });
});
