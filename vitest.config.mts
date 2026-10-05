import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("Thiếu TEST_DATABASE_URL (xem .env.example)");

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    // Test tích hợp dùng chung một CSDL test thật nên chạy tuần tự.
    fileParallelism: false,
    globalSetup: ["./tests/global-setup.ts"],
    env: { DATABASE_URL: testDb },
  },
});
