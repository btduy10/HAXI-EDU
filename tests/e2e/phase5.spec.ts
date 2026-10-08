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
  await expect(page.getByText("Học thêm", { exact: true }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Xuất: chọn Lớp học thêm rồi tải Excel.
  await page.getByLabel("Loại lớp cần xuất").selectOption({ label: "Lớp học thêm" });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^lop-hoc-them-.*\.xlsx$/);
});

test("Học phí: đặt học phí lớp, thu hai lần, theo dõi trạng thái, mở phiếu thu và giấy báo", async ({ page }) => {
  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Menu Học phí nằm ngay sau Chấm công.
  await page.goto(`/admin/tuition?classId=${classId}`);
  await expect(page.getByRole("heading", { name: "Học phí", exact: true })).toBeVisible();
  const badge = (text: string) => page.locator("li").getByText(text, { exact: true }).first();
  await expect(badge("Chưa đặt học phí")).toBeVisible();
  const saved = async (text: string) => {
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByText(text)).toBeVisible();
    await expect(page.getByText(text)).toHaveCount(0);
  };

  // Lớp chưa đặt học phí: gợi ý sẵn 2,000,000 đồng/khóa; gõ số thì tự thêm dấu phẩy phân cách.
  await page.getByRole("button", { name: "Đặt học phí" }).click();
  await expect(page.locator("#f-tuitionFee")).toHaveValue("2,000,000");
  await page.locator("#f-tuitionFee").fill("");
  await page.locator("#f-tuitionFee").pressSequentially("2000000");
  await expect(page.locator("#f-tuitionFee")).toHaveValue("2,000,000");
  await saved("Đã lưu.");
  await expect(badge("Chưa đóng")).toBeVisible();

  // Thu lần 1: 500.000 đ → đóng một phần. Thu vượt số còn lại bị chặn.
  await page.getByRole("button", { name: "Thu tiền" }).first().click();
  await page.locator("#f-amount").fill("2500000");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText(/lớn hơn số còn phải đóng/).first()).toBeVisible();
  await page.locator("#f-amount").fill("500000");
  await page.locator("#f-payerName").fill("Phụ huynh E2E");
  await saved("Đã lập phiếu thu.");
  await expect(badge("Đóng một phần")).toBeVisible();

  // Phiếu thu khi chưa đóng đủ: ghi đã đóng bao nhiêu, còn bao nhiêu.
  await page.getByRole("link", { name: "In phiếu" }).first().click();
  await expect(page).toHaveURL(/\/admin\/tuition\/receipts\//);
  await expect(page.getByText("Đã đóng 500.000 đ, còn 1.500.000 đ")).toBeVisible();
  await page.goto(`/admin/tuition?classId=${classId}`);

  // Thu lần 2: số tiền mặc định = còn lại → đã đóng đủ, không còn nút Thu tiền.
  await page.getByRole("button", { name: "Thu tiền" }).first().click();
  await expect(page.locator("#f-amount")).toHaveValue("1,500,000");
  await saved("Đã lập phiếu thu.");
  await expect(badge("Đã đóng đủ")).toBeVisible();
  await expect(page.getByRole("button", { name: "Thu tiền" })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  // Phiếu thu mới nhất: số tiền bằng chữ.
  await page.getByRole("link", { name: "In phiếu" }).first().click();
  await expect(page).toHaveURL(/\/admin\/tuition\/receipts\//);
  await expect(page.getByRole("heading", { name: "Phiếu thu học phí" })).toBeVisible();
  await expect(page.getByText("Một triệu năm trăm nghìn đồng")).toBeVisible();
  await expect(page.getByText("Đã đóng đủ tiền")).toBeVisible();
  await expect(page.getByRole("button", { name: "In phiếu thu" })).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page.goto(`/admin/tuition/notice?classId=${classId}`);
  await expect(page.getByRole("heading", { name: "Giấy báo học phí" }).first()).toBeVisible();
  await expect(page.getByText(/đã đóng đủ học phí/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Admin hủy một phiếu thu rồi xóa hẳn phiếu đã hủy; phiếu còn hiệu lực không có nút Xóa.
  await page.goto(`/admin/tuition?classId=${classId}`);
  await expect(page.getByRole("button", { name: "Xóa", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Hủy", exact: true }).first().click();
  await page.locator("#f-reason").fill("Ghi nhầm E2E");
  await page.getByRole("button", { name: "Hủy phiếu" }).click();
  await expect(page.getByText("Đã hủy phiếu thu.")).toBeVisible();
  await expect(page.getByText("Đã hủy", { exact: true })).toBeVisible();
  page.once("dialog", (dialog) => {
    expect(dialog.message()).toContain("Xóa hẳn phiếu thu đã hủy");
    void dialog.accept();
  });
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await expect(page.getByText("Đã xóa phiếu thu.")).toBeVisible();
  await expect(page.getByText("Đã hủy", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "In phiếu" })).toHaveCount(1);
});

test("Syllabus: Admin thêm bài và tải tệp mẫu; GV điểm danh chọn tên bài, ghi nhận xét; Admin xem ở chi tiết buổi", async ({ page, browser }) => {
  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Thêm một bài cho lớp RB-TG01; trùng Lớp + Mã môn + Tiết bị chặn.
  await page.goto(`/admin/syllabus?classId=${classId}`);
  const addLesson = async (title: string) => {
    await page.getByRole("button", { name: "Thêm", exact: true }).click();
    await page.locator("#f-subjectCode").fill("ROB");
    await page.locator("#f-period").fill("1");
    await page.locator("#f-title").fill(title);
    await page.getByRole("button", { name: "Lưu" }).click();
  };
  await addLesson("Làm quen với robot E2E");
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await expect(page.getByText("Làm quen với robot E2E").first()).toBeVisible();
  await expect(page.getByText("Đã lưu.")).toHaveCount(0);
  await addLesson("Trùng tiết");
  await expect(page.getByText("Lớp này đã có bài ở Mã môn và Tiết đó.").first()).toBeVisible();
  await page.getByRole("button", { name: "Hủy" }).click();
  await expectNoHorizontalScroll(page);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Tải tệp mẫu" }).click()]);
  expect(download.suggestedFilename()).toBe("mau-syllabus.xlsx");

  // Buổi học hôm nay của lớp, do GV01 (gv.lan) dạy.
  const db = sql();
  const [lan] = await db`select teacher_id from "user" where username = 'gv.lan'`;
  const [session] = await db`
    insert into sessions (class_id, date, start_time, end_time, teacher_id)
    values (${classId}, ${today()}, '06:00', '06:45', ${lan!.teacher_id})
    returning id`;
  await db.end();
  const sessionId = session!.id as string;

  const teacherContext = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
  const teacher = await teacherContext.newPage();
  await login(teacher, "gv.lan", NEW_PASSWORD);
  await expect(teacher).toHaveURL(/\/teacher\/dashboard$/);
  await teacher.goto(`/teacher/sessions/${sessionId}/attendance`);
  await teacher.getByLabel("Nội dung buổi học", { exact: true }).selectOption({ label: "Tiết 1 – Làm quen với robot E2E" });
  // Chọn "Khác" thì hiện ô gõ; chọn lại bài thì ô gõ ẩn đi.
  await teacher.getByLabel("Nội dung buổi học", { exact: true }).selectOption({ label: "Khác (tự nhập)" });
  await expect(teacher.getByLabel("Nội dung buổi học (tự nhập)")).toBeVisible();
  await teacher.getByLabel("Nội dung buổi học", { exact: true }).selectOption({ label: "Tiết 1 – Làm quen với robot E2E" });
  await expect(teacher.getByLabel("Nội dung buổi học (tự nhập)")).toHaveCount(0);
  await teacher.getByLabel("Nhận xét của giáo viên sau buổi dạy").fill("Lớp học tốt E2E");
  await expectNoHorizontalScroll(teacher);
  await teacher.getByRole("button", { name: "Lưu điểm danh" }).click();
  await expect(teacher.getByText(/Đã lưu điểm danh/)).toBeVisible();
  await teacher.reload();
  await expect(teacher.getByLabel("Nội dung buổi học", { exact: true })).toHaveValue("Tiết 1 – Làm quen với robot E2E");
  await expect(teacher.getByLabel("Nhận xét của giáo viên sau buổi dạy")).toHaveValue("Lớp học tốt E2E");
  await teacherContext.close();

  await page.goto(`/admin/sessions/${sessionId}`);
  await expect(page.getByText("Tiết 1 – Làm quen với robot E2E")).toBeVisible();
  await expect(page.getByText("Lớp học tốt E2E")).toBeVisible();
});
