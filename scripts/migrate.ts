import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

// Áp dụng migration trong thư mục ./drizzle. Chạy: npm run db:migrate
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu biến môi trường DATABASE_URL");
  const client = postgres(url, { max: 1, onnotice: () => {} });
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
  await client.end();
  console.log("Đã áp dụng migration.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
