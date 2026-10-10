import { createHmac } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type Page, expect } from "@playwright/test";
import postgres from "postgres";

export const SEED_PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? "Haxi@2026";
export const NEW_PASSWORD = "MatKhauMoi2026";

export const sql = () => postgres(process.env.TEST_DATABASE_URL!, { max: 1, onnotice: () => {} });

/** Mã TOTP (RFC 6238, SHA-1, 6 số, chu kỳ 30 giây) từ khóa base32. */
export function totp(secretBase32: string, now = Date.now()): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretBase32.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, "0");
  const key = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0xf;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

export async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Tên đăng nhập").fill(username);
  await page.getByLabel("Mật khẩu").fill(password);
  await page.getByRole("button", { name: "Đăng nhập" }).click();
}

/** Đăng nhập lần đầu bằng mật khẩu tạm và đổi sang mật khẩu mới. */
export async function firstLogin(page: Page, username: string) {
  await login(page, username, SEED_PASSWORD);
  await expect(page).toHaveURL(/\/change-password$/);
  await page.getByLabel("Mật khẩu hiện tại").fill(SEED_PASSWORD);
  await page.getByLabel("Mật khẩu mới", { exact: true }).fill(NEW_PASSWORD);
  await page.getByLabel("Nhập lại mật khẩu mới").fill(NEW_PASSWORD);
  await page.getByRole("button", { name: "Lưu mật khẩu" }).click();
}

export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, "trang không được cuộn ngang ở 360px").toBeLessThanOrEqual(0);
}

/** Danh sách có hai bản (thẻ cho di động, bảng cho màn hình rộng); chỉ lấy bản đang hiển thị. */
/**
 * Mở thẳng một địa chỉ ngoài phạm vi: phải ra trang "không tìm thấy".
 * Trang hiện khung chờ trước rồi mới có kết quả nên mã HTTP là 200; kiểm tra theo nội dung.
 */
export async function expectNotFound(page: Page, url: string) {
  await page.goto(url);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
}

export const visibleText = (page: Page, text: string) => page.getByText(text).filter({ visible: true }).first();

// Khóa TOTP của admin được tạo ở phase1 và dùng lại ở các tệp test sau.
const ADMIN_SECRET_FILE = join(tmpdir(), "haxi-e2e-admin-totp.txt");
export const saveAdminSecret = (secret: string) => writeFileSync(ADMIN_SECRET_FILE, secret, "utf8");
export const loadAdminSecret = () => readFileSync(ADMIN_SECRET_FILE, "utf8").trim();
