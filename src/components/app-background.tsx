/**
 * Nền cố định toàn trang, nằm dưới mọi nội dung; không hiện khi in.
 * Màu nền là dải xanh ngọc chuyển dọc, khai báo ở utility `app-bg` trong globals.css (chỉ là CSS, không tải tệp nào).
 */
export function AppBackground() {
  return <div aria-hidden className="app-bg pointer-events-none fixed inset-0 -z-10 print:hidden" />;
}
