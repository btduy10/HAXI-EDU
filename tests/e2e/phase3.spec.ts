import { type Page, expect, test } from "@playwright/test";
import { NEW_PASSWORD, expectNoHorizontalScroll, expectNotFound, loadAdminSecret, login, sql, totp } from "./helpers";

// Chạy sau phase1 + phase2: hôm nay mỗi lớp đã có một buổi học.
test.describe.configure({ mode: "serial" });

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
const STUDENT = "Ngô Khánh Linh";

let sessionId = "";
let otherSessionId = "";
let studentId = "";
let otherStudentId = "";
let classId = "";

test.beforeAll(async () => {
  const db = sql();
  const [own] = await db`
    select s.id, s.class_id from sessions s join classes c on c.id = s.class_id
    where c.code = 'RB-CB01' and s.date = ${today()} and s.kind = 'regular' limit 1`;
  const [other] = await db`
    select s.id from sessions s join classes c on c.id = s.class_id where c.code = 'RB-NC01' and s.date = ${today()} limit 1`;
  const [student] = await db`select id from students where full_name = ${STUDENT}`;
  const [otherStudent] = await db`select id from students where code = 'HV015'`;
  sessionId = own!.id;
  classId = own!.class_id;
  otherSessionId = other!.id;
  studentId = student!.id;
  otherStudentId = otherStudent!.id;
  // Đưa tổng sao của học viên về đúng 19 (sát mốc 20 của cấp 2) để kịch bản lên/tụt cấp ổn định.
  const [{ total }] = (await db`select coalesce(sum(stars), 0)::int as total from star_logs where student_id = ${studentId}`) as unknown as [{ total: number }];
  if (total !== 19) await db`insert into star_logs (student_id, stars, note) values (${studentId}, ${19 - total}, 'Điều chỉnh cho kiểm thử')`;
  await db`update students set current_avatar_id = (select id from avatars where name = 'Pico') where id = ${studentId}`;
  await db.end();
});

async function award(page: Page, names: string[] | "all", criteria: RegExp) {
  if (names === "all") await page.getByRole("button", { name: "Chọn cả lớp" }).click();
  else for (const name of names) await page.getByRole("checkbox", { name: `Chọn ${name}` }).click();
  await page.getByRole("button", { name: "Ghi sao", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: criteria }).click();
}

test("GV ghi sao trên điện thoại: cả lớp, lên cấp, đổi avatar, tụt cấp tự đổi avatar, giới hạn trừ, hoàn tác", async ({ page }) => {
  await login(page, "gv.lan", NEW_PASSWORD);
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  await page.goto(`/teacher/sessions/${sessionId}/attendance`);
  await page.getByRole("link", { name: "Ghi sao" }).click();
  await expect(page).toHaveURL(new RegExp(`/teacher/sessions/${sessionId}/stars$`));
  await expect(page.getByRole("checkbox")).toHaveCount(8);
  await expectNoHorizontalScroll(page);

  // Lên cấp: 19 + 1 = 20 sao → chúc mừng.
  await award(page, [STUDENT], /Phát biểu xây dựng bài/);
  await expect(page.getByText(`Chúc mừng! ${STUDENT} đã lên cấp Kỹ sư tập sự.`)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: `Chọn ${STUDENT}` })).toContainText("Cấp 2");
  await page.screenshot({ path: "test-results/shots/stars-levelup-360.png", fullPage: true });

  // Đổi sang avatar cấp 2 vừa mở; avatar cấp cao hơn vẫn khóa.
  await page.goto(`/teacher/students/${studentId}`);
  await expect(page.getByRole("heading", { name: new RegExp(STUDENT) })).toBeVisible();
  await expect(page.getByRole("button", { name: /Vua Robot, đang khóa, cần 200 sao/ })).toBeDisabled();
  await page.getByRole("button", { name: "Bánh Răng" }).click();
  await expect(page.getByText('Đã đổi avatar thành "Bánh Răng".')).toBeVisible();
  await expect(page.getByRole("button", { name: "Bánh Răng" })).toHaveAttribute("aria-pressed", "true");
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/student-avatars-360.png", fullPage: true });

  // Tụt cấp: 20 − 1 = 19 → về cấp 1, avatar cấp 2 bị khóa nên tự đổi.
  await page.goto(`/teacher/sessions/${sessionId}/stars`);
  await award(page, [STUDENT], /Mất trật tự/);
  await expect(page.getByText(new RegExp(`${STUDENT} tụt từ cấp Kỹ sư tập sự xuống Tân binh\\. Avatar đang dùng bị khóa nên đã tự đổi sang "Bu Lông"`))).toBeVisible();
  await expect(page.getByRole("checkbox", { name: `Chọn ${STUDENT}` })).toContainText("Cấp 1");
  await page.screenshot({ path: "test-results/shots/stars-leveldown-360.png" });

  // Giới hạn trừ 3 sao/buổi: đã trừ 1, trừ thêm 2 được, trừ thêm 2 nữa bị chặn.
  await award(page, [STUDENT], /Không giữ gìn thiết bị/);
  await expect(page.getByText(/Đã ghi -2 sao/)).toBeVisible();
  await award(page, [STUDENT], /Không giữ gìn thiết bị/);
  await expect(page.getByText(/chỉ bị trừ tối đa 3 sao trong một buổi/)).toBeVisible();
  await page.getByRole("button", { name: "Close" }).click();

  // Hoàn tác lần trừ gần nhất: ghi bản đảo, bản gốc bị gạch.
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: `Hoàn tác -2 sao của ${STUDENT}` }).click();
  await expect(page.getByText("Đã hoàn tác.")).toBeVisible();
  await expect(page.getByText("đã hoàn tác").first()).toBeVisible();

  // Ghi cho cả lớp.
  await page.getByRole("checkbox", { name: `Chọn ${STUDENT}` }).click(); // bỏ chọn em đang chọn dở
  await award(page, "all", /Hoàn thành nhiệm vụ/);
  await expect(page.getByText("Đã ghi +3 sao (Hoàn thành nhiệm vụ) cho 8 học viên.")).toBeVisible();

  const db = sql();
  const [{ total }] = (await db`select greatest(0, sum(stars))::int as total from star_logs where student_id = ${studentId}`) as unknown as [{ total: number }];
  await db.end();
  expect(total).toBe(19 + 1 - 1 - 2 + 2 + 3);

  // Danh sách lớp có avatar, cấp, tổng sao và thanh tiến độ.
  await page.goto(`/teacher/classes/${classId}`);
  await expect(page.getByRole("progressbar")).toHaveCount(8);
  await expect(page.getByRole("img", { name: /^Avatar / })).toHaveCount(8);
  await expect(page.getByRole("link", { name: new RegExp(STUDENT) })).toContainText("Cấp 2");
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/class-progress-360.png", fullPage: true });
});

test("GV không ghi sao, không xem hồ sơ, không đổi avatar của học viên lớp khác", async ({ page }) => {
  await login(page, "gv.lan", NEW_PASSWORD);
  await expect(page).toHaveURL(/\/teacher\/dashboard$/);
  await expectNotFound(page, `/teacher/sessions/${otherSessionId}/stars`);
  await expectNotFound(page, `/teacher/students/${otherStudentId}`);
  // GV xem được menu Sao & Avatar nhưng chỉ đọc: không có nút thêm/sửa/xóa cấu hình, không có mục tặng avatar.
  await expectNotFound(page, `/admin/sessions/${otherSessionId}/stars`);
  await page.goto("/admin/stars?tab=criteria");
  await expect(page.getByRole("heading", { name: /Tiêu chí sao/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^(Sửa|Xóa) / })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Tặng avatar" })).toHaveCount(0);
  await page.goto("/admin/stars?tab=avatars");
  await expect(page.getByRole("button", { name: "Sửa" })).toHaveCount(0);
  await page.goto("/admin/stars?tab=ledger");
  await expect(page.getByText("RB-NC01")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
});

test("Admin: tiêu chí, cấp bậc, kho avatar, tặng avatar, sổ cái", async ({ page }) => {
  await login(page, "admin", NEW_PASSWORD);
  await page.getByLabel("Mã xác thực").fill(totp(loadAdminSecret()));
  await page.getByRole("button", { name: "Xác nhận" }).click();
  await expect(page).toHaveURL(/\/admin\/dashboard$/);

  await page.goto("/admin/stars");
  await expect(page.getByRole("heading", { name: /Tiêu chí sao/ })).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Bảng cấp phải tăng dần: đặt mốc cấp 2 vượt cấp 3 bị từ chối.
  await page.getByRole("link", { name: "Cấp bậc" }).click();
  await page.getByRole("button", { name: "Sửa Kỹ sư tập sự" }).click();
  await page.getByLabel("Số sao tối thiểu").fill("60");
  await page.getByRole("button", { name: "Lưu" }).click();
  await expect(page.locator('[data-slot="alert"]')).toContainText("Mốc sao của cấp sau phải lớn hơn cấp trước");
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  await expectNoHorizontalScroll(page);

  await page.getByRole("link", { name: "Kho avatar" }).click();
  await expect(page.getByRole("img", { name: /^Avatar / })).toHaveCount(15);
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/avatar-catalog-360.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.screenshot({ path: "test-results/shots/avatar-catalog-1280.png", fullPage: true });
  await page.setViewportSize({ width: 360, height: 740 });

  // Tặng avatar riêng đầu tiên trong danh sách ("Bạn Tốt") rồi kiểm tra ở hồ sơ học viên.
  await page.getByRole("link", { name: "Tặng avatar" }).click();
  await page.getByRole("button", { name: "Tặng" }).first().click();
  await page.getByLabel("Học viên").selectOption({ label: `HV008 – ${STUDENT}` });
  await page.getByRole("dialog").getByRole("button", { name: "Tặng" }).click();
  await expect(page.getByText("Đã tặng avatar.")).toBeVisible();
  await page.goto(`/admin/students/${studentId}`);
  await expect(page.getByRole("button", { name: "Bạn Tốt" })).toContainText("Được tặng");
  await expectNoHorizontalScroll(page);

  await page.goto("/admin/stars?tab=ledger");
  await expect(page.getByText(/Sổ cái chỉ thêm/)).toBeVisible();
  await expect(page.getByText("Hoàn tác: Không giữ gìn thiết bị").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.screenshot({ path: "test-results/shots/ledger-360.png" });
});
