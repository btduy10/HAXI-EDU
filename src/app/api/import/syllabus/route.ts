import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { IMPORT_MAX_BYTES } from "@/domain/student-import";
import { AppError } from "@/server/errors";
import { handleRoute } from "@/server/route";
import { buildSyllabusTemplate, commitSyllabusImport, previewSyllabusImport } from "@/server/services/syllabus";

/** Tải tệp mẫu nhập Syllabus (chỉ Admin; service kiểm tra quyền). */
export async function GET(request: Request) {
  return handleRoute(request, async (actor) => {
    const bytes = await buildSyllabusTemplate(actor);
    return new Response(bytes as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="mau-syllabus.xlsx"',
        "Cache-Control": "no-store",
      },
    });
  });
}

/** Xem trước (`?mode=preview`) hoặc ghi (`?mode=commit`) Syllabus từ Excel. */
export async function POST(request: Request) {
  return handleRoute(request, async (actor) => {
    // Chặn sớm theo Content-Length trước khi đọc thân request.
    if (Number(request.headers.get("content-length") ?? 0) > IMPORT_MAX_BYTES + 64 * 1024) {
      throw new AppError("VALIDATION", "Tệp phải nhỏ hơn 2 MB.");
    }
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw new AppError("VALIDATION", "Chưa chọn tệp.");
    const upload = { name: file.name, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) };

    if (new URL(request.url).searchParams.get("mode") === "commit") {
      const result = await commitSyllabusImport(actor, upload);
      revalidatePath("/admin", "layout");
      return NextResponse.json({ ok: true, data: result });
    }
    return NextResponse.json({ ok: true, data: await previewSyllabusImport(actor, upload) });
  });
}
