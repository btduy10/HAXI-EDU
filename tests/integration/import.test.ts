import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { assertXlsxUpload, parseWorkbook } from "@/server/services/import";

const COLUMNS = [
  { key: "code", header: "Mã" },
  { key: "name", header: "Tên" },
] as const;

async function workbook(rows: (string | number)[][], header: string[] = ["Mã", "Tên"]) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet("Dữ liệu");
  sheet.addRow(header);
  for (const row of rows) sheet.addRow(row);
  const bytes = new Uint8Array(await wb.xlsx.writeBuffer());
  return { name: "du-lieu.xlsx", size: bytes.byteLength, bytes };
}

describe("tệp Excel tải lên (dùng cho nhập Syllabus)", () => {
  it("từ chối tệp sai loại, sai nội dung, quá lớn", async () => {
    const good = await workbook([["A1", "Hợp lệ"]]);
    expect(() => assertXlsxUpload(good)).not.toThrow();
    expect(() => assertXlsxUpload({ ...good, name: "du-lieu.csv" })).toThrow(/\.xlsx/);
    const fake = new TextEncoder().encode("<html>không phải excel</html>");
    expect(() => assertXlsxUpload({ name: "x.xlsx", size: fake.byteLength, bytes: fake })).toThrow(/không phải Excel/);
    expect(() => assertXlsxUpload({ ...good, size: 3 * 1024 * 1024 })).toThrow(/2 MB/);
    expect(() => assertXlsxUpload({ ...good, size: 0 })).toThrow(/2 MB/);
  });

  it("đọc theo dòng tiêu đề, bỏ dòng trống; thiếu cột bắt buộc hoặc không có dữ liệu thì báo lỗi", async () => {
    const file = await workbook([["A1", "Một"], ["", ""], ["A2", "Hai"]]);
    const rows = await parseWorkbook(file.bytes, COLUMNS, ["code"], "Thiếu cột Mã");
    expect(rows).toEqual([
      { rowNumber: 2, cells: { code: "A1", name: "Một" } },
      { rowNumber: 4, cells: { code: "A2", name: "Hai" } },
    ]);
    const noCode = await workbook([["Một"]], ["Tên"]);
    await expect(parseWorkbook(noCode.bytes, COLUMNS, ["code"], "Thiếu cột Mã")).rejects.toMatchObject({ code: "VALIDATION", message: "Thiếu cột Mã" });
    const empty = await workbook([]);
    await expect(parseWorkbook(empty.bytes, COLUMNS, ["code"], "Thiếu cột Mã")).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
