import { describe, expect, it } from "vitest";
import { accountEmail } from "@/domain/account-email";

describe("thư gửi thông tin tài khoản", () => {
  const input = { name: "Nguyễn Thị Lan", username: "gv.lan", password: "MatKhauTam88", loginUrl: "https://haxi.example/login" };

  it("có tên đăng nhập, mật khẩu tạm, đường dẫn và hướng dẫn đăng nhập ở cả bản chữ lẫn bản HTML", () => {
    const mail = accountEmail(input);
    expect(mail.subject).toContain("HAXI STEM");
    for (const body of [mail.text, mail.html]) {
      expect(body).toContain("gv.lan");
      expect(body).toContain("MatKhauTam88");
      expect(body).toContain("https://haxi.example/login");
      expect(body).toContain("Hướng dẫn đăng nhập");
      expect(body).toContain("đổi mật khẩu");
    }
    expect(mail.text).toContain("Chào Nguyễn Thị Lan,");
  });

  it("thoát ký tự HTML trong tên và mật khẩu", () => {
    const mail = accountEmail({ ...input, name: '<img src=x onerror="a()">', password: "a<b>&1'c" });
    expect(mail.html).not.toContain("<img");
    expect(mail.html).toContain("&lt;img src=x onerror=&quot;a()&quot;&gt;");
    expect(mail.html).toContain("a&lt;b&gt;&amp;1&#39;c");
    // Bản chữ giữ nguyên mật khẩu để người nhận gõ đúng.
    expect(mail.text).toContain("Mật khẩu tạm: a<b>&1'c");
  });
});
