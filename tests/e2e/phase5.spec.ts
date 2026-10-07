import { expect, test } from "@playwright/test";
import { NEW_PASSWORD, expectNoHorizontalScroll, loadAdminSecret, login, sql, totp } from "./helpers";

// Chạy sau phase1–4: admin đã bật 2FA, gv.lan đã đổi mật khẩu. Dùng lớp mới RB-TG01 để không ảnh hưởng lớp khác.
test.describe.configure({ mode: "serial" });

const tz = { timeZone: "Asia/Ho_Chi_Minh" } as const;
const today = () => new Intl.DateTimeFormat("en-CA", tz).format(new Date());
const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
// Thứ ISO của hôm nay: 1 = Thứ Hai … 7 = Chủ nhật.
const isoWeekday = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

let classId = "";

test.beforeAll(async () => {
  const db = sql();
  const [base] = await db`select course_id, default_room_id from classes where code = 'RB-CB01'`;
  const [cls] = await db`
    insert into classes (code, name, course_id, default_room_id, start_date, end_date, max_size)
    values ('RB-TG01', 'Lớp có trợ giảng', ${base!.course_id}, ${base!.default_room_id}, ${shift(today(), -7)}, ${shift(today(), 30)}, 10)
    returning id`;
  classId = cls!.id;
  const [student] = await db`select id from students where code = 'HV001'`;
  await db`insert into enrollments (class_id, student_id, joined_at) values (${classId}, ${student!.id}, ${shift(today(), -7)})`;
  // Ca riêng sáng sớm để không trùng các buổi đã có trong dữ liệu mẫu.
  await db`insert into time_slots (name, frame, default_start, default_end) values ('Ca E2E', 1, '05:00', '05:45')`;
  await db.end();
});

test("Phân công GV chính + trợ giảng kèm lương, lịch mẫu tự sinh buổi; trợ giảng điểm danh; Admin xóa buổi đã điểm danh", async ({ page, browser }) => {
  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Phân công: GV02 dạy chính 300.000đ/buổi, GV01 (gv.lan) trợ giảng 150.000đ/buổi.
  await page.goto(`/admin/classes/${classId}`);
  const section = (heading: RegExp) => page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });
  for (const [teacher, role, rate] of [
    ["GV02 – Trần Văn Minh", "GV chính", "300000"],
    ["GV01 – Nguyễn Thị Lan", "Trợ giảng", "150000"],
  ] as const) {
    await section(/Giáo viên phụ trách/).getByRole("button", { name: "Phân công" }).click();
    await page.locator("#f-teacherId").selectOption({ label: teacher });
    await page.locator("#f-role").selectOption({ label: role });
    await page.locator("#f-ratePerSession").fill(rate);
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByText("Đã lưu.")).toBeVisible();
    await expect(page.getByText("Đã lưu.")).toHaveCount(0);
  }
  await expect(section(/Giáo viên phụ trách/).getByText("300.000 đ").first()).toBeVisible();

  // Lịch mẫu thứ hôm nay, có trợ giảng → buổi tự có trên Thời khóa biểu, không cần bấm Sinh buổi.
  await section(/Lịch mẫu hằng tuần/).getByRole("button", { name: "Thêm" }).click();
  await page.locator("#f-weekday").selectOption(String(isoWeekday(today())));
  await page.locator("#f-timeSlotId").selectOption({ label: "Ca E2E (05:00–05:45)" });
  await page.locator("#f-teacherId").selectOption({ label: "GV02 – Trần Văn Minh" });
  await page.locator("#f-assistantTeacherId").selectOption({ label: "GV01 – Nguyễn Thị Lan" });
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText(/Đã tự thêm \d+ buổi vào Thời khóa biểu\./)).toBeVisible();

  const db = sql();
  const [session] = await db`select id from sessions where class_id = ${classId} and date = ${today()}`;
  expect(session, "buổi hôm nay phải được tự sinh").toBeTruthy();
  const sessionId = session!.id as string;

  // Trợ giảng (gv.lan) thấy lớp ở "Lớp của tôi" và điểm danh được buổi mình trợ giảng.
  const teacherContext = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const teacher = await teacherContext.newPage();
  await login(teacher, "gv.lan", NEW_PASSWORD);
  await expect(teacher).toHaveURL(/\/teacher\/dashboard$/);
  await teacher.goto("/teacher/classes");
  await expect(teacher.getByText("RB-TG01").first()).toBeVisible();
  await teacher.goto(`/teacher/sessions/${sessionId}/attendance`);
  await teacher.getByRole("button", { name: "Lưu điểm danh" }).click();
  await expect(teacher.getByText(/Đã lưu điểm danh/)).toBeVisible();
  await teacherContext.close();

  // Admin xóa buổi đã điểm danh: hộp xác nhận nói rõ sẽ xóa kèm điểm danh.
  await page.goto(`/admin/sessions/${sessionId}`);
  await expect(page.getByText("Trợ giảng").first()).toBeVisible();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("1 lượt điểm danh");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Xóa buổi" }).click();
  await expect(page).toHaveURL(/\/admin\/timetable\?date=/);
  expect(await db`select id from sessions where id = ${sessionId}`).toHaveLength(0);
  expect(await db`select id from attendances where session_id = ${sessionId}`).toHaveLength(0);
  await db.end();
});

test("Lớp học thêm: Admin thêm ở trang Lớp học, Thời khóa biểu hiện mục Học thêm đúng thứ; trùng thứ + khung + phòng bị báo", async ({ page }) => {
  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Dùng thứ của ngày mai để không trùng lịch mẫu của RB-TG01 (thứ hôm nay, Ca E2E).
  const day = shift(today(), 1);
  await page.goto("/admin/classes");
  const section = page.locator("section").filter({ has: page.getByRole("heading", { name: /Lớp học thêm/ }) });
  const add = async (name: string) => {
    await section.getByRole("button", { name: "Thêm", exact: true }).click();
    await page.locator("#f-name").fill(name);
    await page.locator("#f-courseId").selectOption({ index: 1 });
    await page.locator("#f-roomId").selectOption({ index: 1 });
    await page.locator("#f-weekday").selectOption(String(isoWeekday(day)));
    await page.locator("#f-timeSlotId").selectOption({ label: "Ca E2E – Khung 1 (05:00–05:45)" });
    await page.getByRole("button", { name: "Lưu" }).click();
  };
  await add("Toán thêm E2E");
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await expect(section.getByText("Toán thêm E2E").first()).toBeVisible();
  await expect(page.getByText("Đã lưu.")).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await add("Trùng phòng E2E");
  await expect(page.getByText(/Trùng phòng với lớp học thêm "Toán thêm E2E"/).first()).toBeVisible();
  await page.getByRole("button", { name: "Hủy" }).click();

  await page.goto(`/admin/timetable?date=${day}`);
  await expect(page.getByText("Toán thêm E2E").first()).toBeVisible();
  await expect(page.getByText("Học thêm").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
});
