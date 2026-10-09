import { describe, expect, it } from "vitest";
import { compactMoney, financePeriods, periodIndexOf } from "@/domain/finance";

describe("kỳ của báo cáo tài chính", () => {
  it("tuần: 12 tuần Thứ Hai–Chủ nhật, tuần cuối chứa ngày mốc", () => {
    // 21/01/2026 là Thứ Tư.
    const weeks = financePeriods("week", "2026-01-21");
    expect(weeks).toHaveLength(12);
    expect(weeks.at(-1)).toEqual({ key: "2026-01-19", label: "19/1", title: "Tuần 19/01/2026 – 25/01/2026", from: "2026-01-19", to: "2026-01-25" });
    expect(weeks[0]).toMatchObject({ from: "2025-11-03", to: "2025-11-09" });
    // Các tuần liền nhau, không chồng lấn.
    for (let i = 1; i < weeks.length; i++) expect(weeks[i]!.from > weeks[i - 1]!.to).toBe(true);
    // Chủ nhật vẫn thuộc tuần bắt đầu từ Thứ Hai trước đó.
    expect(financePeriods("week", "2026-01-25").at(-1)!.from).toBe("2026-01-19");
  });

  it("tháng: 12 tháng của năm chứa ngày mốc (kể cả tháng 2 năm nhuận); năm: 5 năm gần nhất", () => {
    const months = financePeriods("month", "2024-07-15");
    expect(months.map((m) => m.label)).toEqual(["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12"]);
    expect(months[1]).toEqual({ key: "2024-02", label: "T2", title: "Tháng 2/2024", from: "2024-02-01", to: "2024-02-29" });
    expect(months.at(-1)).toMatchObject({ from: "2024-12-01", to: "2024-12-31" });

    const years = financePeriods("year", "2026-01-21");
    expect(years.map((y) => [y.key, y.from, y.to])).toEqual([
      ["2022", "2022-01-01", "2022-12-31"],
      ["2023", "2023-01-01", "2023-12-31"],
      ["2024", "2024-01-01", "2024-12-31"],
      ["2025", "2025-01-01", "2025-12-31"],
      ["2026", "2026-01-01", "2026-12-31"],
    ]);
  });

  it("tìm kỳ chứa một ngày; ngày ngoài khoảng trả -1", () => {
    const months = financePeriods("month", "2026-01-21");
    expect(periodIndexOf(months, "2026-01-01")).toBe(0);
    expect(periodIndexOf(months, "2026-12-31")).toBe(11);
    expect(periodIndexOf(months, "2025-12-31")).toBe(-1);
    expect(periodIndexOf(months, "2027-01-01")).toBe(-1);
  });

  it("số tiền gọn cho trục biểu đồ", () => {
    expect(compactMoney(0)).toBe("0");
    expect(compactMoney(500)).toBe("500");
    expect(compactMoney(50_000)).toBe("50k");
    expect(compactMoney(2_500_000)).toBe("2,5 tr");
    expect(compactMoney(-4_000_000)).toBe("-4 tr");
    expect(compactMoney(1_200_000_000)).toBe("1,2 tỷ");
  });
});
