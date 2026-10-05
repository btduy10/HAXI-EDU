import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("Thiếu TEST_DATABASE_URL (xem .env.example)");

// E2E chạy trên CSDL test (được dựng lại + seed ở global setup), không đụng CSDL phát triển.
export default defineConfig({
  testDir: "./tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    // Điện thoại 360px: giáo viên điểm danh trên di động.
    { name: "mobile-360", use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      DATABASE_URL: testDb,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      AUTH_RATE_LIMIT: "off",
      LOGIN_MAX_FAILED_ATTEMPTS: "5",
    },
  },
});
