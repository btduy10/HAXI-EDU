import { execSync } from "node:child_process";
import vitestSetup from "../global-setup";

/** Dựng lại CSDL test rồi nạp dữ liệu mẫu (admin, gv.lan, gv.minh, 2 lớp, 15 học viên). */
export default async function setup() {
  await vitestSetup();
  execSync("npx tsx scripts/seed.ts", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL, SEED_DEMO_ACCOUNTS: "true" },
  });
}
