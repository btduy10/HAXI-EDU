import { z } from "zod";

// Thông báo lỗi mặc định của Zod bằng tiếng Việt.
z.config(z.locales.vi());

export const REQUIRED = "Bắt buộc nhập";

export const reqText = (max: number) => z.string({ error: REQUIRED }).trim().min(1, REQUIRED).max(max, `Tối đa ${max} ký tự`);

export const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Tối đa ${max} ký tự`)
    .nullish()
    .transform((v) => (v ? v : null));

export const code = z
  .string({ error: REQUIRED })
  .trim()
  .min(1, REQUIRED)
  .max(20, "Tối đa 20 ký tự")
  .regex(/^[A-Za-z0-9_-]+$/, "Chỉ gồm chữ không dấu, số, gạch nối")
  .transform((v) => v.toUpperCase());

export const id = z.uuid("Mã định danh không hợp lệ");

export const optId = z
  .union([z.uuid(), z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

function isRealDate(value: string) {
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const isoDate = z
  .string({ error: REQUIRED })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày không hợp lệ")
  .refine(isRealDate, "Ngày không hợp lệ");

export const optIsoDate = z
  .union([isoDate, z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

export const timeOfDay = z
  .string({ error: REQUIRED })
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Giờ không hợp lệ")
  .transform((v) => v.slice(0, 5));

export const optPhone = z
  .union([z.string().trim().regex(/^[0-9+][0-9 .-]{7,14}$/, "Số điện thoại không hợp lệ"), z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

export const optEmail = z
  .union([z.email("Email không hợp lệ").max(120), z.literal("")])
  .nullish()
  .transform((v) => (v ? v : null));

export const intIn = (min: number, max: number) =>
  z.coerce
    .number({ error: "Phải là số" })
    .int("Phải là số nguyên")
    .min(min, `Tối thiểu ${min}`)
    .max(max, `Tối đa ${max}`);

export const optIntIn = (min: number, max: number) =>
  z
    .union([z.literal(""), z.null(), z.undefined(), intIn(min, max)])
    .transform((v) => (typeof v === "number" ? v : null));

export const idOnly = z.object({ id });
