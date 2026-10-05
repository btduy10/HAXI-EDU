import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppError, translateDbError } from "./errors";
import type { Actor } from "./guard";
import { consumeToken } from "./rate-limit";
import { requireActor } from "./session";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}

export function toFailure(e: unknown): { ok: false; error: string; fieldErrors?: Record<string, string> } {
  const err = translateDbError(e);
  if (err instanceof AppError) return { ok: false, error: err.message, fieldErrors: err.fieldErrors };
  // Không ghi dữ liệu đầu vào (có thể chứa thông tin cá nhân) vào log.
  console.error("[action] Lỗi không mong đợi:", err instanceof Error ? err.name : "unknown");
  return { ok: false, error: "Đã xảy ra lỗi. Vui lòng thử lại." };
}

/**
 * Vỏ chung cho mọi Server Action: lấy phiên ở máy chủ → giới hạn tốc độ →
 * kiểm tra Zod → gọi service (service tự kiểm tra quyền) → làm mới trang.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  fn: (actor: Actor, data: z.output<S>) => Promise<T>,
  revalidate?: string,
): Promise<ActionResult<T>> {
  try {
    const actor = await requireActor();
    if (!consumeToken(`action:${actor.userId}`, 60, 2)) {
      throw new AppError("RATE_LIMITED", "Bạn thao tác quá nhanh. Vui lòng thử lại sau ít giây.");
    }
    const parsed = schema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: "Dữ liệu không hợp lệ.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    const data = await fn(actor, parsed.data);
    if (revalidate) revalidatePath(revalidate, "layout");
    return { ok: true, data };
  } catch (e) {
    return toFailure(e);
  }
}
