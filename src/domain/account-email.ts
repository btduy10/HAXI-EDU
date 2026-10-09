// Nội dung thư gửi thông tin đăng nhập cho người dùng (hàm thuần, không phụ thuộc máy chủ).

export type AccountEmailInput = {
  /** Tên người nhận (họ tên giáo viên). */
  name: string;
  username: string;
  password: string;
  /** Địa chỉ trang đăng nhập. */
  loginUrl: string;
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

const STEPS = [
  "Mở trang đăng nhập theo đường dẫn ở trên (dùng được trên điện thoại và máy tính).",
  "Nhập tên đăng nhập và mật khẩu tạm rồi bấm Đăng nhập.",
  "Hệ thống yêu cầu đổi mật khẩu ngay lần đầu: đặt mật khẩu mới tối thiểu 8 ký tự, có cả chữ và số.",
  "Từ lần sau, đăng nhập bằng tên đăng nhập và mật khẩu mới của bạn.",
];
const NOTES = [
  "Nhập sai mật khẩu nhiều lần liên tiếp thì tài khoản tạm khóa một lúc.",
  "Không chia sẻ mật khẩu cho người khác. Quên mật khẩu, hãy liên hệ quản trị viên của trung tâm để được cấp lại.",
];

export function accountEmail({ name, username, password, loginUrl }: AccountEmailInput) {
  const subject = "HAXI STEM – Thông tin tài khoản đăng nhập";
  const text = [
    `Chào ${name},`,
    "",
    "Trung tâm gửi bạn thông tin tài khoản đăng nhập hệ thống quản lý HAXI STEM:",
    "",
    `Trang đăng nhập: ${loginUrl}`,
    `Tên đăng nhập: ${username}`,
    `Mật khẩu tạm: ${password}`,
    "",
    "Hướng dẫn đăng nhập:",
    ...STEPS.map((step, i) => `${i + 1}. ${step}`),
    "",
    "Lưu ý:",
    ...NOTES.map((note) => `- ${note}`),
    "",
    "Trân trọng,",
    "HAXI STEM",
  ].join("\n");

  const cell = "padding:6px 12px;border:1px solid #d9e2ea";
  const row = (label: string, value: string) =>
    `<tr><td style="${cell};color:#4a5b6c">${label}</td><td style="${cell};font-weight:600">${value}</td></tr>`;
  const url = escapeHtml(loginUrl);
  const html = [
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0e2841">',
    `<p>Chào ${escapeHtml(name)},</p>`,
    "<p>Trung tâm gửi bạn thông tin tài khoản đăng nhập hệ thống quản lý HAXI STEM:</p>",
    '<table style="border-collapse:collapse">',
    row("Trang đăng nhập", `<a href="${url}">${url}</a>`),
    row("Tên đăng nhập", escapeHtml(username)),
    row("Mật khẩu tạm", `<span style="font-family:Consolas,monospace">${escapeHtml(password)}</span>`),
    "</table>",
    "<p><strong>Hướng dẫn đăng nhập</strong></p>",
    `<ol>${STEPS.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`,
    "<p><strong>Lưu ý</strong></p>",
    `<ul>${NOTES.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}</ul>`,
    "<p>Trân trọng,<br>HAXI STEM</p>",
    "</div>",
  ].join("");

  return { subject, text, html };
}
