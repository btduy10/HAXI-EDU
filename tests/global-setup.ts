import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** Dựng lại schema của CSDL test từ migration trước mỗi lần chạy. */
export default async function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("Thiếu TEST_DATABASE_URL");
  if (!/test/i.test(new URL(url).pathname)) throw new Error("TEST_DATABASE_URL phải trỏ tới CSDL có chữ 'test' trong tên");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await client.unsafe("drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;");
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
}
