import { inArray } from "drizzle-orm";
import { db, type DbOrTx } from "@/db";
import { appSettings } from "@/db/schema";

// Cấu hình nghiệp vụ lưu trong app_settings; thiếu hoặc sai kiểu thì dùng mặc định.
export const SETTING_DEFAULTS = {
  attendance_lock_days: 7,
  max_deduction_per_session: 3,
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

export async function getSettings(tx: DbOrTx = db): Promise<Record<SettingKey, number>> {
  const keys = Object.keys(SETTING_DEFAULTS) as SettingKey[];
  const rows = await tx.select().from(appSettings).where(inArray(appSettings.key, keys));
  const out: Record<SettingKey, number> = { ...SETTING_DEFAULTS };
  for (const row of rows) {
    if (typeof row.value === "number" && Number.isInteger(row.value) && row.value >= 0) out[row.key as SettingKey] = row.value;
  }
  return out;
}
