import { expect, test } from "@playwright/test";
import { NEW_PASSWORD, loadAdminSecret, login, totp } from "./helpers";

// Chạy sau các phase trước (thứ tự tên tệp): admin đã đổi mật khẩu và bật 2FA.
test.describe.configure({ mode: "serial" });

const ADMIN_PAGES = [
  "/admin/dashboard",
  "/admin/courses",
  "/admin/rooms-slots",
  "/admin/teachers",
  "/admin/syllabus",
  "/admin/accounts",
  "/admin/settings",
  "/admin/audit",
  "/admin/students",
  "/admin/enrollments",
  "/admin/classes",
  "/admin/timetable",
  "/admin/timetable?view=month",
  "/admin/attendance",
  "/admin/stars",
  "/admin/rewards",
  "/admin/timesheet",
  "/admin/tuition",
  "/admin/reports",
];

test("Giao diện: không tràn ngang ở tablet và màn hình rộng, thanh điều hướng đổi dạng theo cỡ màn hình, tắt hiệu ứng khi giảm chuyển động", async ({ page }) => {
  test.setTimeout(240_000);
  // Lỗi JavaScript ở bất kỳ trang nào cũng làm hỏng bài kiểm tra.
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));

  await login(page, "admin", NEW_PASSWORD);
  await expect(page).toHaveURL(/\/two-factor$/);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Tablet (dải icon) và màn hình rộng: bảng dài phải cuộn trong khung, không đẩy rộng trang.
  for (const width of [768, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const url of ADMIN_PAGES) {
      await page.goto(url);
      await expect(page.getByRole("status", { name: "Đang tải" })).toHaveCount(0);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${url} tràn ngang ở ${width}px`).toBeLessThanOrEqual(0);
    }
  }

  // 768px: thanh điều hướng thu thành dải icon, mục vẫn bấm được theo tên; từ 1280px hiện đủ nhãn.
  await page.setViewportSize({ width: 768, height: 900 });
  await page.goto("/admin/dashboard");
  const rail = page.locator("aside");
  expect((await rail.boundingBox())!.width).toBeLessThan(100);
  await rail.getByRole("link", { name: "Học viên" }).click();
  await expect(page).toHaveURL(/\/admin\/students$/);
  await expect(rail.getByRole("link", { name: "Học viên" })).toHaveAttribute("aria-current", "page");
  await page.setViewportSize({ width: 1280, height: 900 });
  expect((await rail.boundingBox())!.width).toBeGreaterThan(200);
  await expect(rail.getByText("Thời khóa biểu")).toBeVisible();

  // Giảm chuyển động: mọi animation của trang Tổng quan chạy xong tức thì, số KPI hiện ngay giá trị thật.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { name: /^Xin chào/ })).toBeVisible();
  const longest = await page.evaluate(() =>
    Math.max(0, ...document.getAnimations().map((animation) => Number(animation.effect?.getComputedTiming().endTime ?? 0))),
  );
  expect(longest, "animation dài nhất khi bật giảm chuyển động (ms)").toBeLessThan(1);
  const kpi = page.getByRole("link", { name: /Học viên đang học/ });
  const shown = await kpi.textContent();
  expect(shown).toMatch(/Học viên đang học\s*[1-9]\d*$/);
  await page.waitForTimeout(900);
  expect(await kpi.textContent()).toBe(shown);

  expect(pageErrors).toEqual([]);
});
