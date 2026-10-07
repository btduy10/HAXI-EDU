import { eq, inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { appSettings } from "@/db/schema";
import { type PermissionConfig, normalizePermissions } from "@/lib/permissions";
import { AppError } from "./errors";

// Cấu hình nghiệp vụ lưu trong app_settings; thiếu hoặc sai kiểu thì dùng mặc định.
export const SETTING_DEFAULTS = {
  attendance_lock_days: 7,
  max_deduction_per_session: 3,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export const PERMISSIONS_KEY = "role_permissions";

/** Bảng phân quyền theo vai trò (Cấu hình → Phân quyền); chưa lưu lần nào thì là mặc định. */
export async function getPermissionConfig(tx: DbOrTx = db): Promise<PermissionConfig> {
  const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, PERMISSIONS_KEY)).limit(1);
  return normalizePermissions(row?.value);
}

export async function getSettings(tx: DbOrTx = db): Promise<Record<SettingKey, number>> {
  const keys = Object.keys(SETTING_DEFAULTS) as SettingKey[];
  const rows = await tx.select().from(appSettings).where(inArray(appSettings.key, keys));
  const out: Record<SettingKey, number> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (typeof row.value === "number" && Number.isInteger(row.value) && row.value >= 0) out[row.key as SettingKey] = row.value;
  }
  return out;
}

/** Vai trò gán cho tài khoản/giáo viên phải đang tồn tại trong Cấu hình → Phân quyền ("admin" chỉ hợp lệ với tài khoản). */
export async function assertKnownRole(role: string, tx: DbOrTx = db, allowAdmin = false) {
  if (allowAdmin && role === "admin") return;
  if (!Object.hasOwn(await getPermissionConfig(tx), role)) {
    throw new AppError("VALIDATION", "Vai trò không tồn tại. Hãy tải lại trang.", { role: "Vai trò không tồn tại" });
  }
}

export const CENTER_INFO_KEY = "center_info";
export type CenterInfo = { name: string; address: string; phone: string; bank: string };
const CENTER_DEFAULT: CenterInfo = { name: "HAXI STEM", address: "", phone: "", bank: "" };

/** Thông tin trung tâm in ở đầu giấy báo học phí và phiếu thu (Cấu hình → Thông tin trung tâm). */
export async function getCenterInfo(tx: DbOrTx = db): Promise<CenterInfo> {
  const [row] = await tx.select().from(appSettings).where(eq(appSettings.key, CENTER_INFO_KEY)).limit(1);
  const raw = (row?.value && typeof row.value === "object" ? row.value : {}) as Record<string, unknown>;
  const text = (key: keyof CenterInfo) => (typeof raw[key] === "string" && raw[key] ? (raw[key] as string) : CENTER_DEFAULT[key]);
  return { name: text("name"), address: text("address"), phone: text("phone"), bank: text("bank") };
}
