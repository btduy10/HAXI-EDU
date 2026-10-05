import type { DbOrTx } from "@/db";
import { auditLogs } from "@/db/schema";

export type AuditEntry = {
  userId: string | null;
  action: string;
  tableName: string;
  recordId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
};

export async function audit(dbOrTx: DbOrTx, entry: AuditEntry) {
  await dbOrTx.insert(auditLogs).values({
    userId: entry.userId,
    action: entry.action,
    tableName: entry.tableName,
    recordId: entry.recordId ?? null,
    oldValue: entry.oldValue ?? null,
    newValue: entry.newValue ?? null,
  });
}
