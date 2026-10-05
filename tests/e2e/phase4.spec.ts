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
  await expect(page.getByRole("heading", { name: "Cơ cấu điểm danh của lớp" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Sao của lớp theo học viên" })).toBeVisible();
  await page.goto(`/admin/rewards?tab=summary&classId=${otherClassId}`);
  await page.screenshot({ path: "test-results/shots/summary-1280.png", fullPage: true });
  await page.goto("/admin/dashboard");
  await expect(page.getByRole("heading", { name: "Điểm danh 30 ngày qua" })).toBeVisible();
  await expect(page.getByRole("img", { name: /có đi học: \d+%/ })).toBeVisible();
  await page.screenshot({ path: "test-results/shots/dashboard-1280.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 740 });

  // Biểu đồ trên điện thoại: không tràn ngang, có chú giải số liệu.
  await expect(page.getByRole("heading", { name: "Chuyên cần theo lớp" })).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "Vắng không phép" }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/dashboard-360.png", fullPage: true });
  await page.goto(`/admin/reports?classId=${ownClassId}`);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/report-charts-360.png", fullPage: true });

  // Sửa tài khoản: đổi tên hiển thị của một GV; trùng tên đăng nhập bị từ chối.
  await page.goto("/admin/accounts");
  const lan = page.getByRole("listitem").filter({ hasText: "gv.lan" });
  await lan.getByRole("button", { name: "Sửa" }).click();
  await page.getByLabel("Tên đăng nhập").fill("gv.minh");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByRole("dialog").getByText("Tên đăng nhập đã tồn tại").first()).toBeVisible();
  await page.getByLabel("Tên đăng nhập").fill("gv.lan");
  await page.getByLabel("Tên hiển thị").fill("Cô Lan Robotics");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã cập nhật tài khoản.")).toBeVisible();
  await expect(lan).toContainText("Cô Lan Robotics");

  // Sửa tài khoản không làm tài khoản bị khóa. Admin khóa tay rồi mở khóa lại được; không có nút khóa chính mình.
  await expect(lan.getByText("Đang khóa")).toHaveCount(0);
  page.on("dialog", (dialog) => void dialog.accept());
  await lan.getByRole("button", { name: "Khóa", exact: true }).click();
  await expect(page.getByText("Đã khóa tài khoản.")).toBeVisible();
  await expect(lan.getByText("Đang khóa")).toBeVisible();
  await lan.getByRole("button", { name: "Mở khóa", exact: true }).click();
  await expect(page.getByText("Đã mở khóa tài khoản.")).toBeVisible();
  await expect(lan.getByText("Đang khóa")).toHaveCount(0);
  const self = page.getByRole("listitem").filter({ hasText: "Quản trị" }).first();
  await expect(self.getByRole("button", { name: /khóa/i })).toHaveCount(0);

  // Tạo một tài khoản rồi xóa hẳn; không có nút xóa chính mình.
  await page.getByRole("button", { name: "Thêm tài khoản" }).click();
  await page.locator("#f-username").fill("tam.thoi");
  await page.locator("#f-name").fill("Tài khoản tạm");
  await page.locator("#f-role").selectOption("admin");
  await page.locator("#f-password").fill("MatKhauTam88");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã tạo tài khoản.")).toBeVisible();
  const temp = page.getByRole("listitem").filter({ hasText: "tam.thoi" });
  await temp.getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(page.getByText("Đã xóa tài khoản.")).toBeVisible();
  await expect(temp).toHaveCount(0);
  await expect(self.getByRole("button", { name: "Xóa", exact: true })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // Đặt lại mật khẩu có nút con mắt và lựa chọn dùng luôn.
  const minh = page.getByRole("listitem").filter({ hasText: "gv.minh" });
  await minh.getByRole("button", { name: "Đặt lại mật khẩu" }).click();
  await page.locator("#f-password").fill("MatKhauDatLai8");
  await page.getByRole("dialog").getByRole("button", { name: "Nhấn giữ để xem nội dung đã nhập" }).dispatchEvent("pointerdown");
  await expect(page.locator("#f-password")).toHaveAttribute("type", "text");
  await page.getByRole("dialog").getByRole("button", { name: "Nhấn giữ để xem nội dung đã nhập" }).dispatchEvent("pointerup");
  await page.locator("#f-mustChange").selectOption({ label: "Dùng luôn mật khẩu này" });
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã đặt lại mật khẩu.")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/accounts-edit-360.png", fullPage: true });

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
  // gv.minh bị khóa tạm ở phase1 (sai mật khẩu 5 lần). Ở test trước, Admin đã đặt lại mật khẩu với lựa chọn
  // "Dùng luôn mật khẩu này": việc đó phải gỡ khóa và cho đăng nhập thẳng, không bắt đổi mật khẩu.
  const db = sql();
  const [session] = await db`select id from sessions where class_id = ${otherClassId} and status = 'done' order by date desc limit 1`;
  await db.end();

  await login(page, "gv.minh", "MatKhauDatLai8");
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);

  await page.goto("/teacher/classes");
  await expect(page.getByText("Đã đóng")).toBeVisible();
  await page.goto(`/teacher/sessions/${session!.id}/stars`);
  await page.getByRole("button", { name: "Chọn cả lớp" }).click();
  await page.getByRole("button", { name: "Ghi sao", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Hoàn thành nhiệm vụ/ }).click();
  await expect(page.getByText(/Lớp đã đóng và đã chốt tổng kết/)).toBeVisible();
});
