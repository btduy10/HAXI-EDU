import ExcelJS from "exceljs";
import pdfmake from "pdfmake";
import robotoFonts from "pdfmake/fonts/Roboto";
import { formatDateTime } from "@/lib/format";
import { AppError } from "./errors";

// Xuất báo cáo ra Excel (.xlsx) hoặc PDF từ cùng một mô tả tài liệu.

export type ExportColumn = { header: string; width?: number; align?: "left" | "right" | "center" };
export type ExportSection = { title: string; columns: ExportColumn[]; rows: (string | number)[][] };
export type ExportDoc = {
  /** Tên tệp không dấu, không phần mở rộng. */
  filename: string;
  title: string;
  subtitle?: string;
  sections: ExportSection[];
};

export type ExportFormat = "xlsx" | "pdf";

export function parseFormat(value: string | null): ExportFormat {
  if (value === "xlsx" || value === "pdf") return value;
  throw new AppError("VALIDATION", "Định dạng xuất không hợp lệ (xlsx hoặc pdf).");
}

async function toXlsx(doc: ExportDoc): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  for (const [index, section] of doc.sections.entries()) {
    // Tên sheet: tối đa 31 ký tự, không chứa \ / ? * [ ] :
    const name = `${index + 1}. ${section.title}`.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    const sheet = workbook.addWorksheet(name);
    sheet.addRow([doc.title]).font = { bold: true, size: 14 };
    sheet.addRow([[doc.subtitle, section.title].filter(Boolean).join(" · ")]);
    sheet.addRow([]);
    const header = sheet.addRow(section.columns.map((c) => c.header));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE5E7EB" } };
      cell.border = { bottom: { style: "thin" } };
    });
    for (const row of section.rows) sheet.addRow(row);
    section.columns.forEach((column, i) => {
      const col = sheet.getColumn(i + 1);
      col.width = column.width ?? 18;
      if (column.align) col.alignment = { horizontal: column.align };
    });
    sheet.views = [{ state: "frozen", ySplit: 4 }];
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

let fontsReady = false;

async function toPdf(doc: ExportDoc): Promise<Uint8Array> {
  if (!fontsReady) {
    pdfmake.setFonts(robotoFonts); // Roboto có đủ dấu tiếng Việt
    fontsReady = true;
  }
  const wide = doc.sections.some((s) => s.columns.length > 6);
  const content: unknown[] = [
    { text: doc.title, style: "title" },
    ...(doc.subtitle ? [{ text: doc.subtitle, style: "subtitle" }] : []),
  ];
  for (const section of doc.sections) {
    content.push({ text: section.title, style: "section" });
    if (section.rows.length === 0) {
      content.push({ text: "Không có dữ liệu.", italics: true, color: "#6b7280" });
      continue;
    }
    content.push({
      table: {
        headerRows: 1,
        widths: section.columns.map((c, i) => (i === 0 || (c.width ?? 0) >= 24 ? "*" : "auto")),
        body: [
          section.columns.map((c) => ({ text: c.header, bold: true, fillColor: "#e5e7eb", alignment: c.align ?? "left" })),
          ...section.rows.map((row) => row.map((cell, i) => ({ text: String(cell ?? ""), alignment: section.columns[i]?.align ?? "left" }))),
        ],
      },
      layout: "lightHorizontalLines",
    });
  }
  const buffer = await pdfmake
    .createPdf({
      pageSize: "A4",
      pageOrientation: wide ? "landscape" : "portrait",
      pageMargins: [32, 36, 32, 40],
      defaultStyle: { font: "Roboto", fontSize: 9 },
      styles: {
        title: { fontSize: 15, bold: true },
        subtitle: { fontSize: 10, color: "#4b5563", margin: [0, 2, 0, 0] },
        section: { fontSize: 11, bold: true, margin: [0, 14, 0, 6] },
      },
      footer: (page: number, pages: number) => ({
        text: `HAXI STEM · xuất lúc ${formatDateTime(new Date())} · trang ${page}/${pages}`,
        alignment: "center",
        fontSize: 8,
        color: "#6b7280",
        margin: [0, 12, 0, 0],
      }),
      content,
    })
    .getBuffer();
  return new Uint8Array(buffer);
}

const CONTENT_TYPES: Record<ExportFormat, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
};

export async function renderExport(doc: ExportDoc, format: ExportFormat): Promise<Uint8Array> {
  return format === "xlsx" ? toXlsx(doc) : toPdf(doc);
}

export async function exportResponse(doc: ExportDoc, format: ExportFormat): Promise<Response> {
  const bytes = await renderExport(doc, format);
  const safeName = doc.filename.replace(/[^A-Za-z0-9._-]/g, "-");
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": CONTENT_TYPES[format],
      "Content-Disposition": `attachment; filename="${safeName}.${format}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
