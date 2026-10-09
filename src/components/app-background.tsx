import Image from "next/image";

/**
 * Ảnh nền thật (phong cảnh vườn cây kiểu tranh sơn dầu, đã làm mờ mạnh ở giữa):
 * đặt tệp WebP/AVIF ≤ 250KB, ngang khoảng 1920px vào `public/bg/garden.webp` rồi đổi hằng số dưới đây thành đường dẫn đó.
 * `next/image` tự tạo bản nhỏ cho điện thoại. Để `null` thì dùng gradient mesh `app-bg` trong globals.css.
 */
const PHOTO: string | null = null;

/** Nền cố định toàn trang, nằm dưới mọi nội dung; không hiện khi in. */
export function AppBackground() {
  return (
    <div aria-hidden className="app-bg pointer-events-none fixed inset-0 -z-10 print:hidden">
      {PHOTO && <Image src={PHOTO} alt="" fill preload sizes="100vw" className="object-cover" />}
      {/* Lớp phủ kem để chữ không chìm vào nền. */}
      <div className="absolute inset-0 bg-background/20" />
    </div>
  );
}
