import Image from "next/image";
import photo from "../../public/bg/background.webp";

/**
 * Ảnh nền toàn trang: `public/bg/background.webp` (WebP 1920px, khoảng 120KB). Muốn đổi ảnh thì thay tệp này
 * (giữ dưới 250KB); `next/image` tự tạo bản nhỏ cho điện thoại. Đổi `USE_PHOTO` thành false để dùng gradient `app-bg`.
 * Ảnh được import tĩnh (như logo) để phục vụ từ /_next/static: đường dẫn /bg/... đi qua lớp kiểm tra đăng nhập
 * nên trang đăng nhập sẽ không tải được ảnh.
 * Ảnh mới có vùng tối hơn thì phải tính lại tương phản chữ: lớp phủ trắng ở dưới và độ đục của `glass-window`
 * (globals.css) đang được chọn để chữ phụ đạt AA trên điểm tối nhất của ảnh hiện tại.
 */
const USE_PHOTO = true;

/** Nền cố định toàn trang, nằm dưới mọi nội dung; không hiện khi in. */
export function AppBackground() {
  if (!USE_PHOTO) {
    return (
      <div aria-hidden className="app-bg pointer-events-none fixed inset-0 -z-10 print:hidden">
        <div className="absolute inset-0 bg-background/20" />
      </div>
    );
  }
  return (
    // Màu nền là màu trung bình của ảnh, hiện trong lúc ảnh đang tải.
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-[#a8cde2] print:hidden">
      <Image src={photo} alt="" fill preload sizes="100vw" className="object-cover" />
      {/* Lớp phủ trắng để chữ không chìm vào vùng xanh đậm của ảnh. */}
      <div className="absolute inset-0 bg-white/30" />
    </div>
  );
}
