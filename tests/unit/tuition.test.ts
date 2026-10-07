import { describe, expect, it } from "vitest";
import { moneyInWords, receiptCode, tuitionBalance } from "@/domain/tuition";

describe("học phí", () => {
  it("phải đóng = học phí − giảm; trạng thái theo số đã đóng", () => {
    expect(tuitionBalance(null, 0, 0)).toEqual({ due: 0, remaining: 0, status: "unset" });
    expect(tuitionBalance(2_000_000, 0, 0)).toEqual({ due: 2_000_000, remaining: 2_000_000, status: "unpaid" });
    expect(tuitionBalance(2_000_000, 500_000, 1_000_000)).toEqual({ due: 1_500_000, remaining: 500_000, status: "partial" });
    expect(tuitionBalance(2_000_000, 500_000, 1_500_000)).toEqual({ due: 1_500_000, remaining: 0, status: "paid" });
    // Giảm toàn bộ học phí thì coi như đã đóng đủ.
    expect(tuitionBalance(2_000_000, 2_000_000, 0).status).toBe("paid");
  });

  it("đọc số tiền bằng chữ và định dạng số phiếu", () => {
    expect(moneyInWords(0)).toBe("Không đồng");
    expect(moneyInWords(1_250_000)).toBe("Một triệu hai trăm năm mươi nghìn đồng");
    expect(moneyInWords(2_005_000)).toBe("Hai triệu không trăm lẻ năm nghìn đồng");
    expect(moneyInWords(1_500_000)).toBe("Một triệu năm trăm nghìn đồng");
    expect(moneyInWords(21_415_001)).toBe("Hai mươi mốt triệu bốn trăm mười lăm nghìn không trăm lẻ một đồng");
    expect(moneyInWords(1_000_000_000)).toBe("Một tỷ đồng");
    expect(moneyInWords(750_000)).toBe("Bảy trăm năm mươi nghìn đồng");
    expect(receiptCode(123)).toBe("PT-000123");
  });
});
