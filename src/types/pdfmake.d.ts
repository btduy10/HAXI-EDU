// Khai báo tối thiểu cho API phía máy chủ của pdfmake 0.3 (gói @types/pdfmake còn theo API 0.2).
declare module "pdfmake" {
  type FontFiles = { normal: string; bold: string; italics: string; bolditalics: string };
  const pdfmake: {
    setFonts(fonts: Record<string, FontFiles>): void;
    createPdf(docDefinition: Record<string, unknown>): { getBuffer(): Promise<Buffer> };
  };
  export default pdfmake;
}

declare module "pdfmake/fonts/Roboto" {
  const fonts: Record<string, { normal: string; bold: string; italics: string; bolditalics: string }>;
  export default fonts;
}
