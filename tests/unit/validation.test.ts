import { describe, expect, it } from "vitest";
import { normalizeDate, validateImportRows } from "@/domain/student-import";
import { accountInput, classInput, password, studentInput, timeSlotInput } from "@/lib/validation/entities";
import { consumeToken, resetRateLimits } from "@/server/rate-limit";

describe("xác thực dữ liệu vào", () => {
  it("học viên: chuẩn hóa mã, bỏ trống thành null, chặn giá trị sai", () => {
    const ok = studentInput.parse({ code: " hv01 ", fullName: "  An  ", birthDate: "", gender: "", schoolGrade: "", phone: "", note: "" });
    expect(ok).toMatchObject({ code: "HV01", fullName: "An", birthDate: null, gender: null, schoolGrade: null, phone: null, status: "active" });
    expect(studentInput.safeParse({ code: "HV 01", fullName: "An" }).success).toBe(false);
    expect(studentInput.safeParse({ code: "HV01", fullName: "An", birthDate: "2015-02-30" }).success).toBe(false);
    expect(studentInput.safeParse({ code: "HV01", fullName: "An", schoolGrade: "13" }).success).toBe(false);
    expect(studentInput.safeParse({ code: "HV01", fullName: "An", status: "admin" }).success).toBe(false);
  });

  it("ca học và lớp: thời gian kết thúc phải sau bắt đầu", () => {
    expect(timeSlotInput.safeParse({ name: "Ca", defaultStart: "09:00", defaultEnd: "08:00" }).success).toBe(false);
    expect(timeSlotInput.parse({ name: "Ca", defaultStart: "08:00:00", defaultEnd: "09:30" })).toMatchObject({ defaultStart: "08:00", defaultEnd: "09:30" });
    const base = { code: "L1", name: "Lớp", courseId: "3f2b1c9e-8a47-4c1d-9b2e-5d6f7a8b9c0d", maxSize: 5 };
    expect(classInput.safeParse({ ...base, startDate: "2026-03-01", endDate: "2026-01-01" }).success).toBe(false);
    expect(classInput.safeParse({ ...base, startDate: "2026-01-01", endDate: "2026-03-01" }).success).toBe(true);
  });

  it("mật khẩu và tài khoản", () => {
    expect(password.safeParse("ngan1").success).toBe(false);
    expect(password.safeParse("chicochucai").success).toBe(false);
    expect(password.safeParse("MatKhau12345").success).toBe(true);
    const account = { username: "GV.Lan", name: "Lan", password: "MatKhau12345" };
    expect(accountInput.safeParse({ ...account, role: "teacher", teacherId: "" }).success).toBe(false);
    expect(accountInput.parse({ ...account, role: "admin", teacherId: "" })).toMatchObject({ username: "gv.lan", teacherId: null });
    expect(accountInput.safeParse({ ...account, role: "superuser" }).success).toBe(false);
  });
});

describe("nhập Excel (quy tắc thuần)", () => {
  it("chuẩn hóa ngày", () => {
    expect(normalizeDate("5/9/2015")).toBe("2015-09-05");
    expect(normalizeDate("2015-09-05")).toBe("2015-09-05");
    expect(normalizeDate("")).toBe("");
    expect(normalizeDate("hôm qua")).toBeNull();
  });

  it("phát hiện mã lặp trong tệp và mã đã có", () => {
    const rows = validateImportRows(
      [
        { rowNumber: 2, cells: { code: "hv1", fullName: "A" } },
        { rowNumber: 3, cells: { code: "HV1", fullName: "B" } },
        { rowNumber: 4, cells: { code: "HV2", fullName: "C" } },
      ],
      new Set(["HV2"]),
    );
    expect(rows.map((r) => r.errors.length)).toEqual([0, 1, 1]);
    expect(rows[0]!.data?.code).toBe("HV1");
  });
});

describe("giới hạn tốc độ", () => {
  it("chặn khi hết token và hồi dần theo thời gian", () => {
    resetRateLimits();
    const t0 = 1_000_000;
    expect([1, 2, 3].map(() => consumeToken("k", 3, 1, t0))).toEqual([true, true, true]);
    expect(consumeToken("k", 3, 1, t0)).toBe(false);
    expect(consumeToken("k", 3, 1, t0 + 1000)).toBe(true);
    expect(consumeToken("other", 3, 1, t0)).toBe(true);
  });
});
