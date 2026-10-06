import Image from "next/image";
import logo from "../../public/logo.png";

/** Logo HAXI STEM (nền trong suốt). Chữ trong logo màu navy nên luôn đặt trên nền sáng. */
export function BrandLogo({ height }: { height: number }) {
  return (
    <Image
      src={logo}
      alt="HAXI STEM"
      height={height}
      width={Math.round((height * logo.width) / logo.height)}
      // Logo luôn nằm ở đầu trang nên tải ngay, không chờ lazy-load.
      loading="eager"
    />
  );
}
