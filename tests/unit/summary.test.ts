import { describe, expect, it } from "vitest";
import { type AttendanceStatus, type TaughtSession, attendanceOf, pickTier, rankByStars } from "@/domain/summary";

const session = (id: string, date: string, status: TaughtSession["status"], extra: Partial<TaughtSession> = {}): TaughtSession => ({
  id,
  date,
  kind: "regular",
  status,
  ...extra,
});

describe("tỷ lệ chuyên cần", () => {
  const enrollment = [{ joinedAt: "2026-01-01", leftAt: null }];
  const statuses = (entries: [string, AttendanceStatus][]) => new Map(entries);

  it("tính trên buổi đã dạy; không kể buổi hủy và buổi chưa diễn ra", () => {
    const sessions = [
      session("s1", "2026-01-06", "done"),
      session("s2", "2026-01-13", "done"),
      session("s3", "2026-01-20", "cancelled"),
      session("s4", "2026-01-27", "planned"),
    ];
    const result = attendanceOf("st", enrollment, sessions, statuses([["s1", "present"], ["s2", "absent"], ["s3", "absent"]]));
    expect(result).toMatchObject({ taught: 2, present: 1, absent: 1, rate: 50 });
  });

  it("đi trễ và về sớm vẫn tính là có đi học; vắng có phép thì không", () => {
    const sessions = ["s1", "s2", "s3", "s4"].map((id, i) => session(id, `2026-01-0${i + 1}`, "done"));
    const result = attendanceOf("st", enrollment, sessions, statuses([["s1", "late"], ["s2", "left_early"], ["s3", "excused"], ["s4", "present"]]));
    expect(result).toMatchObject({ taught: 4, late: 1, left_early: 1, excused: 1, present: 1, rate: 75 });
  });

  it("chỉ tính buổi trong thời gian ghi danh; buổi bù chỉ tính cho học viên được chọn", () => {
    const sessions = [
      session("before", "2026-01-05", "done"),
      session("during", "2026-01-15", "done"),
      session("after", "2026-02-05", "done"),
      session("makeup-mine", "2026-01-16", "done", { kind: "makeup", studentIds: new Set(["st"]) }),
      session("makeup-other", "2026-01-17", "done", { kind: "makeup", studentIds: new Set(["khac"]) }),
    ];
    const result = attendanceOf("st", [{ joinedAt: "2026-01-10", leftAt: "2026-02-01" }], sessions, statuses([["during", "present"], ["makeup-mine", "present"]]));
    expect(result).toMatchObject({ taught: 2, present: 2, rate: 100 });
  });

  it("buổi đã dạy thiếu dòng điểm danh tính là vắng; chưa có buổi nào thì 0%", () => {
    expect(attendanceOf("st", enrollment, [session("s1", "2026-01-06", "done")], new Map())).toMatchObject({ taught: 1, absent: 1, rate: 0 });
    expect(attendanceOf("st", enrollment, [], new Map())).toMatchObject({ taught: 0, rate: 0 });
    expect(attendanceOf("st", enrollment, [1, 2, 3].map((i) => session(`s${i}`, `2026-01-0${i}`, "done")), statuses([["s1", "present"]])).rate).toBe(33.33);
  });
});

describe("xếp hạng", () => {
  it("theo tổng sao giảm dần, đồng hạng kiểu 1-2-2-4", () => {
    const ranked = rankByStars([{ id: "a", totalStars: 10 }, { id: "b", totalStars: 30 }, { id: "c", totalStars: 20 }, { id: "d", totalStars: 20 }, { id: "e", totalStars: 0 }]);
    expect(ranked.map((r) => [r.id, r.rank])).toEqual([["b", 1], ["c", 2], ["d", 2], ["a", 4], ["e", 5]]);
    expect(rankByStars([])).toEqual([]);
  });
});

describe("mốc quà", () => {
  const tier = (id: string, minStars: number, scope: { classId?: string; courseId?: string }) => ({
    id,
    minStars,
    giftId: `gift-${id}`,
    classId: scope.classId ?? null,
    courseId: scope.courseId ?? null,
  });
  const courseTiers = [tier("c10", 10, { courseId: "k" }), tier("c30", 30, { courseId: "k" }), tier("c60", 60, { courseId: "k" })];

  it("chọn mốc cao nhất đạt được; chưa đạt mốc nào thì không có quà", () => {
    expect(pickTier(9, courseTiers, "lop")).toBeNull();
    expect(pickTier(10, courseTiers, "lop")?.id).toBe("c10");
    expect(pickTier(59, courseTiers, "lop")?.id).toBe("c30");
    expect(pickTier(500, courseTiers, "lop")?.id).toBe("c60");
  });

  it("lớp có mốc riêng thì chỉ dùng mốc của lớp", () => {
    const tiers = [...courseTiers, tier("l40", 40, { classId: "lop" })];
    expect(pickTier(35, tiers, "lop")).toBeNull();
    expect(pickTier(45, tiers, "lop")?.id).toBe("l40");
    expect(pickTier(35, tiers, "lop-khac")?.id).toBe("c30");
  });
});
