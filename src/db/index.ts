import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Một số tích hợp CSDL (vd. Postgres trên Vercel) đặt tên biến là POSTGRES_URL.
const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) throw new Error("Thiếu biến môi trường DATABASE_URL (hoặc POSTGRES_URL)");

// Tránh tạo nhiều pool khi Next.js hot-reload ở chế độ dev.
const globalForDb = globalThis as unknown as { __pg?: ReturnType<typeof postgres> };
const client =
  globalForDb.__pg ??
  postgres(url, {
    // Serverless (Netlify): mỗi hàm có pool riêng nên đặt DB_POOL_MAX nhỏ (1–2) và dùng địa chỉ pooler.
    max: Number(process.env.DB_POOL_MAX ?? 10),
    // Pooler kiểu PgBouncer (Neon, Supabase) không hỗ trợ prepared statement: đặt DB_PREPARE=false.
    prepare: process.env.DB_PREPARE !== "false",
    idle_timeout: 20,
    onnotice: () => {},
  });
if (process.env.NODE_ENV !== "production") globalForDb.__pg = client;

export const db = drizzle(client, { schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type DbOrTx = Db | Tx;
export const closeDb = () => client.end();
export { schema };
