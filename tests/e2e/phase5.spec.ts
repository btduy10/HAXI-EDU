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

test("Phân công GV chính + trợ giảng, lịch mẫu tự sinh buổi; trợ giảng điểm danh; Admin xóa buổi đã điểm danh", async ({ page, browser }) => {
  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Phân công: GV02 dạy chính, GV01 (gv.lan) trợ giảng. Lương không còn đặt ở Lớp học (đặt ở Chấm công → Mức lương).
  await page.goto(`/admin/classes/${classId}`);
  const section = (heading: RegExp) => page.locator("section").filter({ has: page.getByRole("heading", { name: heading }) });
  for (const [teacher, role] of [
    ["GV02 – Trần Văn Minh", "GV chính"],
    ["GV01 – Nguyễn Thị Lan", "Trợ giảng"],
  ] as const) {
    await section(/Giáo viên phụ trách/).getByRole("button", { name: "Phân công" }).click();
    await page.locator("#f-teacherId").selectOption({ label: teacher });
    await page.locator("#f-role").selectOption({ label: role });
    await expect(page.locator("#f-ratePerSession")).toHaveCount(0);
    await page.getByRole("button", { name: "Lưu" }).click();
    await expect(page.getByText("Đã lưu.")).toBeVisible();
    await expect(page.getByText("Đã lưu.")).toHaveCount(0);
  }
  await expect(section(/Giáo viên phụ trách/).getByText("Trần Văn Minh").first()).toBeVisible();
  await expect(section(/Giáo viên phụ trách/).getByText(/Lương/)).toHaveCount(0);

  // Lịch mẫu thứ hôm nay, có trợ giảng → buổi tự có trên Thời khóa biểu, không cần bấm Sinh buổi.
  await section(/Lịch mẫu hằng tuần/).getByRole("button", { name: "Thêm" }).click();
  await page.locator("#f-weekday").selectOption(String(isoWeekday(today())));
  await page.locator("#f-timeSlotId").selectOption({ label: "Ca E2E (05:00–05:45)" });
  await page.locator("#f-teacherId").selectOption({ label: "GV02 – Trần Văn Minh" });
  await page.locator("#f-assistantTeacherId").selectOption({ label: "GV01 – Nguyễn Thị Lan" });
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText(/Đã tự thêm \d+ buổi vào Thời khóa biểu\./)).toBeVisible();

  // Tên viết tắt: nhập ở menu Giáo viên (Mã GV đứng trước Họ tên), Thời khóa biểu hiện tên viết tắt thay họ tên.
  await page.goto("/admin/teachers");
  await expect(page.locator("ul:visible > li").first()).toContainText("Họ tên:");
  await page.getByRole("button", { name: "Sửa Trần Văn Minh" }).click();
  await page.locator("#f-shortName").fill("T.Minh");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await expect(page.locator("ul:visible > li").filter({ hasText: "Trần Văn Minh" })).toContainText(/Tên viết tắt:\s*T\.Minh/);
  await expectNoHorizontalScroll(page);
  await page.goto(`/admin/timetable?view=week&date=${today()}&classId=${classId}`);
  // GV02 có tên viết tắt; trợ giảng GV01 chưa đặt nên vẫn hiện họ tên.
  await expect(page.locator("a:visible").filter({ hasText: /GV: T\.Minh · Trợ giảng: Nguyễn Thị Lan/ }).first()).toBeVisible();
  await expectNoHorizontalScroll(page);

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

test("Lớp học thêm đã gỡ: trang Lớp học và Thời khóa biểu không còn mục này, dữ liệu cũ trong bảng không hiện lên lưới; nút Excel vẫn xuất Thời khóa biểu", async ({ page }) => {
  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Bảng extra_classes được giữ lại trong CSDL: dữ liệu cũ còn nằm đó cũng không được hiện ở đâu nữa.
  const day = today();
  const db = sql();
  await db`
    insert into extra_classes (name, course_id, room_id, weekday, time_slot_id)
    select 'Toán thêm E2E', c.id, r.id, ${isoWeekday(day)}, s.id from courses c, rooms r, time_slots s limit 1`;
  await db.end();

  for (const [url, heading] of [
    ["/admin/classes", /^Lớp học/],
    [`/admin/timetable?date=${day}`, "Thời khóa biểu"],
    [`/admin/timetable?view=month&date=${day}`, "Thời khóa biểu"],
  ] as const) {
    await page.goto(url);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Lớp học thêm/ })).toHaveCount(0);
    await expect(page.getByText("Toán thêm E2E")).toHaveCount(0);
    await expect(page.getByText("Học thêm", { exact: true })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
  }

  await page.goto(`/admin/timetable?date=${day}`);
  // Không còn ô chọn loại lớp khi xuất: nút Excel luôn xuất Thời khóa biểu của lớp Robotics, không có tệp riêng cho lớp học thêm.
  await expect(page.getByLabel("Loại lớp cần xuất")).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel" }).click()]);
  expect(download.suggestedFilename()).toMatch(/^thoi-khoa-bieu-.*\.xlsx$/);
  const ignored = await page.request.get(`/api/export/timetable?format=xlsx&kind=extra&from=${day}&to=${day}`);
  expect(ignored.headers()["content-disposition"]).toContain("thoi-khoa-bieu-");
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

test("Chấm công: đặt mức lương giáo viên theo lớp, thành tiền; chấm công bổ sung, sửa dòng công (buổi học giữ nguyên), Admin xóa công bổ sung", async ({ page }) => {
  const vn = (iso: string) => iso.split("-").reverse().join("/");
  // Một buổi đã dạy của GV01 ở lớp RB-TG01, giờ riêng để dễ tìm dòng.
  const db = sql();
  const [lan] = await db`select teacher_id from "user" where username = 'gv.lan'`;
  const taughtOn = shift(today(), -5);
  const [session] = await db`
    insert into sessions (class_id, date, start_time, end_time, teacher_id, status)
    values (${classId}, ${taughtOn}, '07:00', '07:45', ${lan!.teacher_id}, 'done')
    returning id`;
  await db.end();

  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  await page.goto(`/admin/timesheet?classId=${classId}`);
  await expect(page.getByRole("heading", { name: "Chấm công giáo viên" })).toBeVisible();
  // Tổng công dùng tiêu đề ngắn; Chi tiết không còn cột Ca, Phòng và hiện tên lớp.
  for (const name of ["Số buổi", "Dạy thay", "Trợ giảng"]) await expect(page.getByRole("columnheader", { name, exact: true })).toBeVisible();
  for (const name of ["Số công", "Ca", "Phòng"]) await expect(page.getByRole("columnheader", { name, exact: true })).toHaveCount(0);
  await expect(page.getByRole("row").filter({ hasText: "07:00–07:45" })).toContainText("Lớp có trợ giảng");
  await expect(page.getByRole("row").filter({ hasText: "07:00–07:45" })).not.toContainText("Thứ");
  const lanSummary = page.getByRole("row").filter({ has: page.getByRole("link", { name: /Xuất Excel của/ }) }).filter({ hasText: "GV01" });
  await expect(lanSummary).toContainText("công chưa có mức lương");

  // Mức lương giáo viên/Nhân viên: đặt 250.000đ/buổi cho GV01 ở lớp RB-TG01; trùng Giáo viên + Lớp bị chặn.
  await page.getByRole("link", { name: "Mức lương giáo viên/Nhân viên" }).click();
  await expect(page).toHaveURL(/\/admin\/timesheet\/rates$/);
  const addRate = async (amount: string) => {
    await page.getByRole("button", { name: "Thêm", exact: true }).click();
    await page.locator("#f-teacherId").selectOption({ label: "GV01 – Nguyễn Thị Lan" });
    await page.locator("#f-classId").selectOption({ label: "RB-TG01 – Lớp có trợ giảng" });
    await page.locator("#f-rate").fill(amount);
    await page.getByRole("button", { name: "Lưu" }).click();
  };
  await addRate("250000");
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await expect(page.getByText("250.000 đ/buổi").first()).toBeVisible();
  await expect(page.getByText("Đã lưu.")).toHaveCount(0);
  await addRate("1");
  await expect(page.getByText("Giáo viên này đã có mức lương ở lớp đó.").first()).toBeVisible();
  await page.getByRole("button", { name: "Hủy" }).click();
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "← Chấm công" }).click();
  await page.goto(`/admin/timesheet?classId=${classId}`);
  await expect(page.getByRole("columnheader", { name: "Thành tiền" }).first()).toBeVisible();
  await expect(lanSummary).toContainText("250.000 đ");
  await expect(lanSummary).not.toContainText("công chưa có mức lương");

  // Chấm công bổ sung: dòng công ghi tay, lớp đang lọc được điền sẵn.
  await page.getByRole("button", { name: "Chấm công bổ sung" }).click();
  await page.locator("#f-teacherId").selectOption({ label: "GV01 – Nguyễn Thị Lan" });
  await page.locator("#f-date").fill(shift(today(), -2));
  await page.locator("#f-timeSlotId").selectOption({ label: "Ca E2E – Khung 1 (05:00–05:45)" });
  await expect(page.locator("#f-classId")).toHaveValue(classId);
  await page.locator("#f-note").fill("Công bổ sung E2E");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã chấm công bổ sung.")).toBeVisible();
  const manual = page.getByRole("row").filter({ hasText: "Công bổ sung E2E" });
  await expect(manual).toContainText("Bổ sung");
  await expect(manual).toContainText(vn(shift(today(), -2)));

  // Sửa công bổ sung: đổi ngày.
  await manual.getByRole("button", { name: "Sửa" }).click();
  await page.locator("#f-date").fill(shift(today(), -3));
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await expect(manual).toContainText(vn(shift(today(), -3)));
  await expect(page.getByText("Đã lưu.")).toHaveCount(0);

  // Sửa dòng công sinh từ buổi học: chỉ đổi trên bảng công, buổi học giữ nguyên ngày.
  const taught = page.getByRole("row").filter({ hasText: "07:00–07:45" });
  await expect(taught).toContainText(vn(taughtOn));
  await taught.getByRole("button", { name: "Sửa" }).click();
  await page.locator("#f-date").fill(shift(today(), -4));
  await page.locator("#f-note").fill("Ghi nhầm ngày E2E");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await expect(taught).toContainText(vn(shift(today(), -4)));
  await expect(taught).toContainText("Đã sửa");
  const check = sql();
  const [kept] = await check`select to_char(date, 'YYYY-MM-DD') as date from sessions where id = ${session!.id}`;
  await check.end();
  expect(kept!.date).toBe(taughtOn);
  await expectNoHorizontalScroll(page);

  // Admin xóa công bổ sung.
  page.once("dialog", (dialog) => dialog.accept());
  await manual.getByRole("button", { name: "Xóa" }).click();
  await expect(page.getByText("Đã xóa công bổ sung.")).toBeVisible();
  await expect(manual).toHaveCount(0);
});

test("Báo cáo: doanh thu – chi – lãi theo tuần/tháng/năm có biểu đồ; nhập mua sắm; chi lương; xuất học phí chưa đóng", async ({ page }) => {
  const money = (n: number) => `${n.toLocaleString("vi-VN")} đ`;
  const db = sql();
  // Lớp RB-CB01 đặt học phí nhưng chưa ai đóng → có học viên trong danh sách chưa đóng học phí.
  await db`update classes set tuition_fee = 1500000 where code = 'RB-CB01'`;
  const [{ revenue }] = await db`
    select coalesce(sum(amount), 0)::int as revenue from tuition_receipts
    where status = 'active' and to_char(paid_at, 'YYYY') = ${today().slice(0, 4)}`;
  await db.end();
  expect(revenue).toBeGreaterThan(0);

  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  // Doanh thu: mặc định theo tháng của năm nay; doanh thu = các phiếu thu học phí còn hiệu lực.
  await page.goto("/admin/reports");
  await expect(page.getByRole("heading", { name: "Báo cáo", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Doanh thu", exact: true })).toHaveAttribute("aria-current", "page");
  const tile = (label: string | RegExp) => page.locator("div.glass-card").filter({ has: page.getByText(label, { exact: true }) });
  await expect(tile("Tổng doanh thu")).toContainText(money(revenue));
  await expect(page.getByRole("heading", { name: "Doanh thu theo tháng" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "Lãi" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/finance-month-360.png", fullPage: true });

  // Đổi kỳ xem và chỉ số của biểu đồ.
  await page.getByLabel("Xem theo").selectOption({ label: "Tuần" });
  await expect(page).toHaveURL(/view=week/);
  await expect(page.getByRole("heading", { name: "Doanh thu theo tuần" })).toBeVisible();
  await page.getByLabel("Chỉ số trên biểu đồ").selectOption({ label: "Lãi" });
  await expect(page.getByRole("heading", { name: "Lãi theo tuần" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/finance-week-360.png", fullPage: true });
  await page.getByLabel("Xem theo").selectOption({ label: "Năm" });
  await expect(page.getByRole("heading", { name: "Lãi theo năm" })).toBeVisible();
  await expect(page.getByRole("cell", { name: `Năm ${today().slice(0, 4)}` })).toBeVisible();

  // Mua sắm: thêm một khoản, thành tiền = số lượng × đơn giá, cộng vào Tổng chi.
  await page.getByRole("link", { name: "Mua sắm", exact: true }).click();
  await expect(page).toHaveURL(/tab=purchases/);
  await page.getByRole("button", { name: "Thêm", exact: true }).click();
  await page.locator("#f-item").fill("Bộ robot E2E");
  await page.locator("#f-category").fill("Thiết bị");
  await page.locator("#f-quantity").fill("2");
  await page.locator("#f-unitPrice").fill("350000");
  await expect(page.locator("#f-unitPrice")).toHaveValue("350,000");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.getByText("Đã lưu.")).toBeVisible();
  await expect(page.getByText("Bộ robot E2E").first()).toBeVisible();
  await expect(page.getByText(/Tổng mua sắm tháng .*700\.000 đ/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "Doanh thu", exact: true }).click();
  await expect(tile("Tổng chi")).toContainText("Mua sắm 700.000 đ");

  // Chi lương: lấy từ Chấm công, có dòng của GV01 (đã đặt mức lương ở lớp RB-TG01).
  await page.getByRole("link", { name: "Chi lương", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Lương giáo viên tháng/ })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "GV01" })).toContainText(/\d đ/);
  await expectNoHorizontalScroll(page);

  // Học phí chưa đóng: có học viên của RB-CB01, tải được tệp Excel và PDF.
  await page.getByRole("link", { name: "Học phí chưa đóng", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Học viên chưa đóng đủ học phí/ })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "RB-CB01" }).first()).toContainText("Chưa đóng");
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/finance-unpaid-360.png", fullPage: true });
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Excel" }).click()]);
  expect(download.suggestedFilename()).toBe("hoc-phi-chua-dong.xlsx");
  const pdf = await page.request.get("/api/export/unpaid-tuition?format=pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
});
