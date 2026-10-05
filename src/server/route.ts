import "server-only";
import { NextResponse } from "next/server";
import { AppError, HTTP_STATUS, translateDbError } from "./errors";
import type { Actor } from "./guard";
import { consumeToken } from "./rate-limit";
import { requireActor } from "./session";

/** Chống CSRF cho Route Handler ghi dữ liệu: Origin phải trùng với host của request. */
function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = null;
  }
  if (!originHost || originHost !== host) throw new AppError("FORBIDDEN", "Yêu cầu không hợp lệ.");
}

/** Vỏ chung cho Route Handler: phiên + CSRF + giới hạn tốc độ + chuyển lỗi thành mã HTTP. */
export async function handleRoute(request: Request, fn: (actor: Actor) => Promise<Response>): Promise<Response> {
  try {
    if (request.method !== "GET" && request.method !== "HEAD") assertSameOrigin(request);
    const actor = await requireActor();
    if (!consumeToken(`api:${actor.userId}`, 30, 1)) {
      throw new AppError("RATE_LIMITED", "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.");
    }
    return await fn(actor);
  } catch (e) {
    const err = translateDbError(e);
    if (err instanceof AppError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: HTTP_STATUS[err.code] });
    }
    console.error("[api] Lỗi không mong đợi:", err instanceof Error ? err.name : "unknown");
    return NextResponse.json({ ok: false, error: "Đã xảy ra lỗi. Vui lòng thử lại." }, { status: 500 });
  }
}
