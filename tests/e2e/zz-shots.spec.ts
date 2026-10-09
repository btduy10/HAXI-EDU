import { mkdirSync } from "node:fs";
import { type Page, expect, test } from "@playwright/test";
import { NEW_PASSWORD, loadAdminSecret, login, sql, totp } from "./helpers";

// Chụp ảnh các trang chính để so sánh giao diện trước/sau khi chỉnh. Chỉ chạy khi đặt SHOTS=<tên bộ ảnh>,
// vd. `SHOTS=after npm run test:e2e`; ảnh nằm ở ui-shots/<tên bộ ảnh>/ (không commit).
// Chạy sau các phase (thứ tự tên tệp): cần tài khoản đã đổi mật khẩu và admin đã bật 2FA.
const set = process.env.SHOTS;
const WIDTHS = [360, 768, 1280, 1920];

const ADMIN_PAGES: [name: string, url: string][] = [
  ["tong-quan", "/admin/dashboard"],
  ["khoa-hoc", "/admin/courses"],
  ["phong-ca", "/admin/rooms-slots"],
  ["giao-vien", "/admin/teachers"],
  ["syllabus", "/admin/syllabus"],
  ["tai-khoan", "/admin/accounts"],
  ["cau-hinh", "/admin/settings"],
  ["nhat-ky", "/admin/audit"],
  ["hoc-vien", "/admin/students"],
  ["ghi-danh", "/admin/enrollments"],
  ["lop-hoc", "/admin/classes"],
  ["tkb-tuan", "/admin/timetable"],
  ["tkb-thang", "/admin/timetable?view=month"],
  ["diem-danh", "/admin/attendance"],
  ["sao-avatar", "/admin/stars"],
  ["qua-tong-ket", "/admin/rewards"],
  ["cham-cong", "/admin/timesheet"],
  ["hoc-phi", "/admin/tuition"],
  ["bao-cao", "/admin/reports"],
  ["doi-mat-khau", "/change-password"],
];

async function shoot(page: Page, name: string, url: string) {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: width < 768 ? 740 : 900 });
    await page.goto(url);
    await expect(page.getByRole("status", { name: "Đang tải" })).toHaveCount(0);
    // Chờ hiệu ứng vào trang (đếm số, vẽ biểu đồ) chạy xong.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `ui-shots/${set}/${name}-${width}.png`, fullPage: true, animations: "disabled" });
  }
}

test.describe("Ảnh chụp giao diện", () => {
  test.skip(!set, "Chỉ chạy khi đặt SHOTS=<tên bộ ảnh>");
  test.setTimeout(600_000);

  test.beforeAll(() => mkdirSync(`ui-shots/${set}`, { recursive: true }));

  test("trang đăng nhập và khu quản lý (Admin)", async ({ page }) => {
    await shoot(page, "dang-nhap", "/login");
    await page.setViewportSize({ width: 360, height: 740 });
    await login(page, "admin", NEW_PASSWORD);
    await expect(page).toHaveURL(/\/two-factor$/);
    await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
    await page.getByRole("button", { name: "Xác nhận" }).click();
    await expect(page).toHaveURL(/\/admin\/dashboard$/);
    for (const [name, url] of ADMIN_PAGES) await shoot(page, name, url);
  });

  test("khu giáo viên", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await login(page, "gv.lan", NEW_PASSWORD);
    await expect(page).toHaveURL(/\/teacher\/dashboard$/);
    await shoot(page, "gv-tong-quan", "/teacher/dashboard");
    await shoot(page, "gv-lop", "/teacher/classes");
    // Trang điểm danh có thanh Lưu cố định ở đáy: lấy buổi mới nhất của lớp gv.lan phụ trách.
    const db = sql();
    const [session] = await db`
      select s.id from sessions s join classes c on c.id = s.class_id
      where c.code = 'RB-CB01' and s.status <> 'cancelled' order by s.date desc, s.start_time desc limit 1`;
    await db.end();
    await shoot(page, "gv-diem-danh", `/teacher/sessions/${session!.id}/attendance`);
    await shoot(page, "gv-cham-sao", `/teacher/sessions/${session!.id}/stars`);
  });
});
