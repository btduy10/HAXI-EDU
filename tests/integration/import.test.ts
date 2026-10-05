import ExcelJS from "exceljs";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { students } from "@/db/schema";
import { commitStudentImport, previewStudentImport } from "@/server/services/import";
import { type Fixture, resetDb, seedFixture } from "./helpers";

async function workbook(rows: (string | number | Date)[][]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Học viên");
  sheet.addRow(["Mã HV", "Họ tên", "Ngày sinh", "Giới tính", "Khối lớp", "Phụ huynh", "Điện thoại", "Ghi chú"]);
  for (const row of rows) sheet.addRow(row);
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  return { name: "hoc-vien.xlsx", size: bytes.byteLength, bytes };
}

let f: Fixture;
beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
});

describe("nhập học viên từ Excel", () => {
  it("xem trước báo lỗi từng dòng, ghi chỉ dòng hợp lệ", async () => {
    const file = await workbook([
      ["hv900", "Nguyễn Văn Tốt", "15/08/2015", "Nam", 5, "Bố Tốt", "0901234567", ""],
      ["A1", "Trùng Mã Hệ Thống", "", "", "", "", "", ""],
      ["HV901", "", "32/13/2015", "abc", 20, "", "12", ""],
      ["HV900", "Lặp Trong Tệp", "", "Nữ", "", "", "", ""],
      ["HV902", "Ngày Kiểu Date", new Date(Date.UTC(2014, 0, 31)), "nữ", 6, "", "", ""],
    ]);
    const preview = await previewStudentImport(f.admin, file);
    expect(preview.validCount).toBe(2);
    expect(preview.errorCount).toBe(3);
    const byRow = Object.fromEntries(preview.rows.map((r) => [r.rowNumber, r.errors.join(" | ")]));
    expect(byRow[3]).toContain("đã tồn tại");
    expect(byRow[4]).toMatch(/Họ tên/);
    expect(byRow[4]).toMatch(/Ngày sinh/);
    expect(byRow[4]).toMatch(/Giới tính/);
    expect(byRow[4]).toMatch(/Khối lớp/);
    expect(byRow[4]).toMatch(/Điện thoại/);
    expect(byRow[5]).toContain("lặp trong tệp");

    const before = (await db.select().from(students)).length;
    const result = await commitStudentImport(f.admin, file);
    expect(result.inserted).toBe(2);
    const all = await db.select().from(students);
    expect(all.length).toBe(before + 2);
    expect(all.find((s) => s.code === "HV900")).toMatchObject({ birthDate: "2015-08-15", gender: "male", schoolGrade: 5 });
    expect(all.find((s) => s.code === "HV902")).toMatchObject({ birthDate: "2014-01-31", gender: "female" });
  });

  it("từ chối tệp sai loại, sai nội dung, quá lớn và người không phải Admin", async () => {
    const good = await workbook([["HV950", "Hợp Lệ", "", "", "", "", "", ""]]);
    await expect(previewStudentImport(f.admin, { ...good, name: "hoc-vien.csv" })).rejects.toMatchObject({ code: "VALIDATION" });
    const fake = new TextEncoder().encode("<html>không phải excel</html>");
    await expect(previewStudentImport(f.admin, { name: "x.xlsx", size: fake.byteLength, bytes: fake })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(previewStudentImport(f.admin, { ...good, size: 3 * 1024 * 1024 })).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(previewStudentImport(f.actorA, good)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(commitStudentImport(f.actorA, good)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
