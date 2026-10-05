/**
 * Điều hướng tải lại toàn trang. Dùng sau khi trạng thái đăng nhập thay đổi để bỏ hẳn
 * cache của router phía trình duyệt (dữ liệu của phiên cũ) và để máy chủ quyết định bước kế tiếp.
 */
export function hardNavigate(path: string) {
  window.location.assign(path);
}
