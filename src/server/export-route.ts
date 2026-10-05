import "server-only";
import { db } from "@/db";
import { audit } from "./audit";
import { type ExportDoc, exportResponse, parseFormat } from "./export";
import type { Actor } from "./guard";
import { handleRoute } from "./route";

/**
 * Vỏ chung cho các route xuất tệp: phiên + giới hạn tốc độ (handleRoute), dựng tài liệu
 * (service tự kiểm tra quyền), ghi nhật ký ai đã xuất gì, rồi trả tệp.
 */
export function handleExport(request: Request, name: string, recordId: string | null, build: (actor: Actor) => Promise<ExportDoc>) {
  return handleRoute(request, async (actor) => {
    const format = parseFormat(new URL(request.url).searchParams.get("format"));
    const doc = await build(actor);
    await audit(db, { userId: actor.userId, action: "export", tableName: name, recordId, newValue: { format } });
    return exportResponse(doc, format);
  });
}