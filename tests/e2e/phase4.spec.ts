import { mkdirSync, writeFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { NEW_PASSWORD, expectNoHorizontalScroll, loadAdminSecret, login, sql, totp } from "./helpers";

// Chạy sau phase1–3. Đóng lớp RB-NC01 (lớp của gv.minh) để không ảnh hưởng dữ liệu lớp RB-CB01.
test.describe.configure({ mode: "serial" });

let ownClassId = "";
let otherClassId = "";

test.beforeAll(async () => {
  const db = sql();
  const rows = await db`select id, code from classes where code in ('RB-CB01', 'RB-NC01')`;
  ownClassId = rows.find((r) => r.code === "RB-CB01")!.id;
  otherClassId = rows.find((r) => r.code === "RB-NC01")!.id;
  await db.end();
  mkdirSync("test-results/exports", { recursive: true });
});

test("GV: báo cáo lớp mình, xuất Excel/PDF; không xem hay xuất được lớp khác", async ({ page }) => {
  await login(page, "gv.lan", NEW_PASSWORD);
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  await page.goto(`/teacher/classes/${ownClassId}`);
  await page.getByRole("link", { name: "Báo cáo lớp" }).click();
  await expect(page.getByRole("heading", { name: "Báo cáo lớp RB-CB01" })).toBeVisible();
  await expect(page.getByText(/Chuyên cần tính trên buổi đã dạy/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/class-report-360.png", fullPage: true });

  // Gọi trực tiếp API xuất bằng phiên của GV.
  const own = await page.request.get(`/api/export/class-report/${ownClassId}?format=xlsx`);
  expect(own.status()).toBe(200);
  expect(own.headers()["content-type"]).toContain("spreadsheetml");
  expect((await own.body()).subarray(0, 2).toString()).toBe("PK");
  const pdf = await page.request.get(`/api/export/class-report/${ownClassId}?format=pdf`);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  writeFileSync("test-results/exports/class-report.pdf", await pdf.body());

  expect((await page.request.get(`/api/export/class-report/${otherClassId}?format=xlsx`)).status()).toBe(404);
  expect((await page.request.get(`/api/export/summary/${ownClassId}?format=xlsx`)).status()).toBe(403);
  expect((await page.request.get(`/api/export/class-report/${ownClassId}?format=exe`)).status()).toBe(400);
  expect((await page.goto(`/teacher/classes/${otherClassId}/report`))!.status()).toBe(404);

  // TKB xuất ra chỉ gồm lịch của mình dù truyền classId của lớp khác.
  const timetable = await page.request.get(`/api/export/timetable?format=pdf&classId=${otherClassId}`);
  expect(timetable.status()).toBe(200);
  for (const path of ["/admin/rewards", "/admin/reports", "/admin/audit", "/admin/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  }
});

test("Admin: cấu hình, đóng lớp, chốt tổng kết, duyệt và trao quà, xuất danh sách, nhật ký", async ({ page }) => {
  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Cấu hình.
  await page.goto("/admin/settings");
  await page.getByRole("button", { name: "Sửa cấu hình" }).click();
  await page.getByLabel("Khóa sửa điểm danh sau (ngày)").fill("10");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("10 ngày")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Kho quà và mốc quà có sẵn từ dữ liệu mẫu.
  await page.goto("/admin/rewards?tab=gifts");
  await expect(page.getByText("Sticker robot").filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.goto("/admin/rewards?tab=tiers");
  await expect(page.getByText("Khóa Robotics Nâng cao").filter({ visible: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Tổng kết: lớp đang mở, còn buổi hôm nay chưa điểm danh → không đóng được.
  await page.goto("/admin/rewards?tab=summary");
  await page.getByLabel("Lớp học").selectOption({ label: "RB-NC01 – Robotics Nâng cao 01 (Đang mở)" });
  await page.getByRole("button", { name: "Xem" }).click();
  await expect(page.getByRole("heading", { name: "Số liệu tạm tính (lớp đang mở)" })).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Đóng lớp & chốt tổng kết" }).click();
  await expect(page.getByText(/buổi đã qua chưa điểm danh/)).toBeVisible();

  // Xử lý các buổi đã qua chưa điểm danh (hủy), rồi đóng lớp.
  const db = sql();
  await db`
    update sessions set status = 'cancelled'
    where class_id = ${otherClassId} and status = 'planned'
      and date <= (now() at time zone 'Asia/Ho_Chi_Minh')::date`;
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Đóng lớp & chốt tổng kết" }).click();
  await expect(page.getByText("Đã đóng lớp và chốt tổng kết.")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tổng kết đã chốt/ })).toBeVisible();
  await expect(page.getByText(/Hệ thống đề xuất \d+ học viên đủ điều kiện nhận quà/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/summary-proposal-360.png", fullPage: true });

  // Duyệt tất cả đề xuất rồi ghi nhận trao một quà.
  await page.getByRole("button", { name: /^Duyệt \d+ học viên$/ }).click();
  await expect(page.getByText(/Đã duyệt quà cho \d+ học viên\./)).toBeVisible();
  await page.getByRole("button", { name: /^Ghi nhận đã trao quà cho / }).first().click();
  await expect(page.getByText(/Đã ghi nhận trao quà cho /)).toBeVisible();
  await expect(page.getByText(/Trao lúc .* bởi Quản trị viên/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Số lượng quà cần chuẩn bị" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/summary-approved-360.png", fullPage: true });

  const [counts] = await db`
    select count(*) filter (where h.status = 'given')::int as given, count(*)::int as total,
           (select count(*)::int from sessions where class_id = ${otherClassId} and status = 'planned') as planned,
           (select status from classes where id = ${otherClassId}) as status
    from gift_handovers h join course_summaries s on s.id = h.summary_id where s.class_id = ${otherClassId}`;
  await db.end();
  expect(counts).toMatchObject({ given: 1, planned: 0, status: "closed" });
  expect(counts!.total).toBeGreaterThanOrEqual(1);

  // Xuất danh sách tổng kết (để in) và TKB.
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "PDF" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("tong-ket-RB-NC01.pdf");
  await file.saveAs("test-results/exports/tong-ket.pdf");
  const xlsx = await page.request.get(`/api/export/summary/${otherClassId}?format=xlsx`);
  expect(xlsx.status()).toBe(200);
  const timetable = await page.request.get("/api/export/timetable?format=pdf");
  writeFileSync("test-results/exports/tkb.pdf", await timetable.body());
  expect((await page.request.get("/api/export/timetable?format=xlsx&from=2026-01-01&to=2027-01-01")).status()).toBe(400);

  // Báo cáo lớp trên màn hình rộng.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto(`/admin/reports?classId=${ownClassId}`);
  await expect(page.getByRole("columnheader", { name: "Chuyên cần" })).toBeVisible();
  await page.screenshot({ path: "test-results/shots/report-1280.png", fullPage: true });
  await page.goto(`/admin/rewards?tab=summary&classId=${otherClassId}`);
  await page.screenshot({ path: "test-results/shots/summary-1280.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 740 });

  // Nhật ký: lọc theo hành động, xem chi tiết.
  await page.goto("/admin/audit");
  await expect(page.getByRole("heading", { name: "Nhật ký" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByLabel("Lọc theo hành động").fill("class_closed");
  await page.getByRole("button", { name: "Lọc" }).click();
  await expect(page.getByText("class_closed")).toHaveCount(1);
  await page.getByText("Chi tiết").click();
  await expect(page.getByText(/"summaries": \d+/)).toBeVisible();
  await page.getByLabel("Lọc theo hành động").fill("export");
  await page.getByRole("button", { name: "Lọc" }).click();
  await expect(page.getByText("export").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/audit-360.png" });
});

test("GV của lớp đã đóng: thấy lớp ở trạng thái đã đóng, không điểm danh hay ghi sao được nữa", async ({ page }) => {
  // gv.minh bị khóa tạm ở phase1 (sai mật khẩu 5 lần); mở khóa và đặt lại để đăng nhập.
  const db = sql();
  await db`update "user" set locked_until = null, failed_attempts = 0 where username = 'gv.minh'`;
  const [session] = await db`select id from sessions where class_id = ${otherClassId} and status = 'done' order by date desc limit 1`;
  await db.end();

  await login(page, "gv.minh", process.env.SEED_DEFAULT_PASSWORD ?? "Haxi@2026");
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Mật khẩu hiện tại").fill(process.env.SEED_DEFAULT_PASSWORD ?? "Haxi@2026");
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Lưu mật khẩu" }).click();
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);

  await page.goto("/teacher/classes");
  await expect(page.getByText("Đã đóng")).toBeVisible();
  await page.goto(`/teacher/sessions/${session!.id}/stars`);
  await page.getByRole("button", { name: "Chọn cả lớp" }).click();
  await page.getByRole("button", { name: "Ghi sao", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Hoàn thành nhiệm vụ/ }).click();
  await expect(page.getByText(/Lớp đã đóng và đã chốt tổng kết/)).toBeVisible();
});
