import { expect, test } from "@playwright/test";
import { NEW_PASSWORD, SEED_PASSWORD, expectNoHorizontalScroll, firstLogin, login, sql, studentWorkbook, totp, visibleText } from "./helpers";

// Các test chạy tuần tự trên cùng CSDL test và phụ thuộc thứ tự (đổi mật khẩu, bật 2FA).
test.describe.configure({ mode: "serial" });

test("chưa đăng nhập bị chuyển về trang đăng nhập, có header bảo mật", async ({ page }) => {
  const response = await page.goto("/admin/students");
  await expect(page).toHaveURL(/\/login$/);
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("script-src 'self' 'nonce-");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  await expectNoHorizontalScroll(page);
});

test("GV: buộc đổi mật khẩu, chỉ thấy lớp mình, không vào được dữ liệu lớp khác hay trang Admin", async ({ page }) => {
  await firstLogin(page, "gv.lan");
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  await expect(page.getByText("RB-CB01")).toBeVisible();
  await expect(page.getByText("RB-NC01")).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  const db = sql();
  const [own] = await db`select id from classes where code = 'RB-CB01'`;
  const [other] = await db`select id from classes where code = 'RB-NC01'`;
  await db.end();

  await page.goto(`/teacher/classes/${own!.id}`);
  await expect(page.getByRole("heading", { name: /RB-CB01/ })).toBeVisible();
  await page.screenshot({ path: "test-results/shots/teacher-class-360.png" });
  await expect(page.getByText("Lê Gia Bảo")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Gọi trực tiếp bằng id lớp của GV khác → 404, không lộ dữ liệu.
  const forbidden = await page.goto(`/teacher/classes/${other!.id}`);
  expect(forbidden!.status()).toBe(404);
  await expect(page.getByText("Robotics Nâng cao")).toHaveCount(0);

  // Trang Admin: bị đưa về trang của GV.
  await page.goto("/admin/students");
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  await page.goto(`/admin/classes/${other!.id}`);
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);

  // Gọi thẳng API (kèm cookie phiên của GV) → 403.
  const template = await page.request.get("/api/import/students");
  expect(template.status()).toBe(403);
  const upload = await page.request.post("/api/import/students?mode=commit", {
    headers: { origin: new URL(page.url()).origin },
    multipart: { file: { name: "a.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("PK\u0003\u0004") } },
  });
  expect(upload.status()).toBe(403);
});

test("API ghi dữ liệu từ chối yêu cầu khác nguồn (CSRF) và yêu cầu chưa đăng nhập", async ({ request }) => {
  const anonymous = await request.get("/api/import/students");
  expect(anonymous.status()).toBe(401);
  const crossSite = await request.post("/api/import/students", {
    headers: { origin: "https://evil.example" },
    multipart: { file: { name: "a.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("x") } },
  });
  expect(crossSite.status()).toBe(403);
});

let adminSecret = "";

test("Admin: đổi mật khẩu → bắt buộc thiết lập 2FA → quản lý học viên trên màn hình 360px", async ({ page }) => {
  await firstLogin(page, "admin");
  await expect(page).toHaveURL(/\/two-factor\/setup$/);

  // Chưa bật 2FA thì không vào được trang quản trị.
  await page.goto("/admin/students");
  await expect(page).toHaveURL(/\/two-factor\/setup$/);

  await page.getByLabel("Nhập lại mật khẩu để tiếp tục").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Tiếp tục" }).click();
  adminSecret = (await page.getByTestId("totp-secret").innerText()).trim();
  expect(adminSecret.length).toBeGreaterThan(10);
  await page.screenshot({ path: "test-results/shots/2fa-setup-360.png", fullPage: true });
  await expectNoHorizontalScroll(page);
  await page.getByLabel(/Nhập mã 6 số/).fill(totp(adminSecret));
  await page.getByRole("button", { name: "Hoàn tất" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
  await expectNoHorizontalScroll(page);

  await page.goto("/admin/students");
  await expect(visibleText(page, "Lê Gia Bảo")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/admin-students-360.png" });

  // Thêm học viên: lỗi xác thực hiển thị theo trường, sau đó lưu thành công.
  await page.getByRole("button", { name: "Thêm" }).click();
  await page.getByLabel("Mã HV").fill("HV 999");
  await page.getByLabel("Họ tên").fill("Trần Thử Nghiệm <script>alert(1)</script>");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Chỉ gồm chữ không dấu, số, gạch nối")).toBeVisible();
  await page.screenshot({ path: "test-results/shots/student-form-error-360.png" });
  await page.getByLabel("Mã HV").fill("HV999");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  // Nội dung người dùng nhập hiển thị dạng văn bản, không chạy như HTML.
  await expect(visibleText(page, "Trần Thử Nghiệm <script>alert(1)</script>")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Nhập Excel: xem trước báo lỗi từng dòng, chỉ ghi dòng hợp lệ.
  await page.goto("/admin/students/import");
  await page.getByLabel("Tệp Excel").setInputFiles({
    name: "hoc-vien.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: await studentWorkbook([
      ["HV800", "Đinh Nhập Excel", "01/02/2015", "Nữ", 4, "", "0903334445", ""],
      ["HV001", "Trùng Mã", "", "", "", "", "", ""],
    ]),
  });
  await page.getByRole("button", { name: "Xem trước" }).click();
  await expect(page.getByText("Mã HV: đã tồn tại trong hệ thống")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/import-preview-360.png", fullPage: true });
  await page.getByRole("button", { name: "Nhập 1 dòng hợp lệ" }).click();
  await expect(page.getByText("Đã nhập 1 học viên.")).toBeVisible();
  await page.goto("/admin/students?q=HV800");
  await expect(visibleText(page, "Đinh Nhập Excel")).toBeVisible();

  // Các trang quản trị còn lại hiển thị được và không tràn ngang ở 360px.
  for (const [path, heading] of [
    ["/admin/teachers", "Giáo viên"],
    ["/admin/courses", "Khóa học"],
    ["/admin/rooms-slots", "Phòng học"],
    ["/admin/enrollments", "Ghi danh"],
    ["/admin/accounts", "Tài khoản"],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await expectNoHorizontalScroll(page);
  }
  await page.screenshot({ path: "test-results/shots/accounts-360.png", fullPage: true });

  // Ghi danh: chọn lớp, thêm học viên vừa nhập.
  await page.goto("/admin/enrollments");
  await page.getByLabel("Lớp học").selectOption({ label: "RB-NC01 – Robotics Nâng cao 01 (7/8)" });
  await page.getByRole("button", { name: "Xem" }).click();
  await page.getByRole("button", { name: "Ghi danh học viên" }).click();
  await page.getByLabel("Học viên").selectOption({ label: "HV800 – Đinh Nhập Excel" });
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã ghi danh.")).toBeVisible();
  await expect(page.getByText("Đinh Nhập Excel")).toBeVisible();
  // Lớp đã đủ 8/8: ghi danh thêm bị chặn ở máy chủ.
  await page.getByRole("button", { name: "Ghi danh học viên" }).click();
  await page.getByLabel("Học viên").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Lớp đã đủ sĩ số tối đa (8).")).toBeVisible();
  await page.screenshot({ path: "test-results/shots/enroll-full-360.png" });
  await page.getByRole("button", { name: "Hủy" }).click();

  // Menu di động.
  await page.getByRole("button", { name: "Mở menu" }).click();
  await page.getByRole("link", { name: "Lớp học" }).click();
  await expect(page).toHaveURL(/\/admin\/classes$/);
  await expect(visibleText(page, "RB-CB01 – Robotics Cơ bản 01")).toBeVisible();
  await page.screenshot({ path: "test-results/shots/admin-classes-360.png" });
  await expectNoHorizontalScroll(page);
});

test("Admin đăng nhập lại phải nhập mã TOTP; mã sai bị từ chối", async ({ page }) => {
  await login(page, "admin", NEW_PASSWORD);
  await expect(page).toHaveURL(/\/two-factor$/);
  // Chỉ có mật khẩu thì chưa có phiên.
  await page.goto("/admin/dashboard");
  await expect(page).toHaveURL(/\/login$/);

  await login(page, "admin", NEW_PASSWORD);
  await expect(page).toHaveURL(/\/two-factor$/);
  await page.getByLabel("Mã xác thực").fill("000000");
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  await page.getByLabel("Mã xác thực").fill(totp(adminSecret));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);
});

test("sai mật khẩu nhiều lần thì tài khoản bị khóa tạm, kể cả khi nhập đúng sau đó", async ({ page }) => {
  for (let i = 0; i < 5; i++) {
    await login(page, "gv.minh", "SaiMatKhau000");
    await expect(page.locator('[data-slot="alert"]')).toBeVisible();
  }
  await login(page, "gv.minh", SEED_PASSWORD);
  await expect(page.locator('[data-slot="alert"]')).toContainText("tạm khóa");
  await expect(page).toHaveURL(/\/login$/);

  const db = sql();
  const actions = await db`select action from audit_logs where action like 'login_%' order by created_at`;
  await db.end();
  expect(actions.map((a) => a.action)).toEqual(expect.arrayContaining(["login_failed", "login_failed_locked", "login_blocked_locked"]));
});
