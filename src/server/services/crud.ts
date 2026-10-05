import { eq } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "@/db";
import { audit } from "../audit";
import { notFound, translateDbError } from "../errors";
import { type Actor, assertAdmin } from "../guard";

type IdTable = PgTable & { id: AnyPgColumn };

// Tạo/sửa/xóa chỉ dành cho Admin, luôn kèm nhật ký. Kiểu của Drizzle không suy ra được
// qua tham số generic nên ép kiểu được gói gọn trong tệp này.
export async function createRow<T extends IdTable>(
  actor: Actor,
  table: T,
  tableName: string,
  values: T["$inferInsert"],
): Promise<T["$inferSelect"]> {
  assertAdmin(actor);
  try {
    return await db.transaction(async (tx) => {
      const rows = (await tx.insert(table).values(values as never).returning()) as T["$inferSelect"][];
      const row = rows[0] as T["$inferSelect"] & { id: string };
      await audit(tx, { userId: actor.userId, action: "create", tableName, recordId: row.id, newValue: row });
      return row;
    });
  } catch (e) {
    throw translateDbError(e);
  }
}

export async function updateRow<T extends IdTable>(
  actor: Actor,
  table: T,
  tableName: string,
  id: string,
  values: Partial<T["$inferInsert"]>,
): Promise<T["$inferSelect"]> {
  assertAdmin(actor);
  try {
    return await db.transaction(async (tx) => {
      const before = (await tx.select().from(table as PgTable).where(eq(table.id, id)).limit(1))[0];
      if (!before) throw notFound();
      const patch = "updatedAt" in table ? { ...values, updatedAt: new Date() } : values;
      const rows = (await tx.update(table).set(patch as never).where(eq(table.id, id)).returning()) as T["$inferSelect"][];
      await audit(tx, { userId: actor.userId, action: "update", tableName, recordId: id, oldValue: before, newValue: rows[0] });
      return rows[0] as T["$inferSelect"];
    });
  } catch (e) {
    throw translateDbError(e);
  }
}

export async function deleteRow<T extends IdTable>(actor: Actor, table: T, tableName: string, id: string): Promise<void> {
  assertAdmin(actor);
  try {
    await db.transaction(async (tx) => {
      const rows = (await tx.delete(table).where(eq(table.id, id)).returning()) as unknown[];
      if (!rows[0]) throw notFound();
      await audit(tx, { userId: actor.userId, action: "delete", tableName, recordId: id, oldValue: rows[0] });
    });
  } catch (e) {
    throw translateDbError(e);
  }
}
