import { BrandLogo } from "@/components/brand-logo";
import type { CenterInfo } from "@/server/settings";

/** Đầu giấy in: logo và thông tin trung tâm (Cấu hình → Thông tin trung tâm). */
export function PrintHeader({ center }: { center: CenterInfo }) {
  return (
    <header className="flex items-center gap-3 border-b pb-3">
      <BrandLogo height={56} />
      <div className="min-w-0 text-sm">
        <p className="text-base font-bold uppercase">{center.name}</p>
        {center.address && <p>Địa chỉ: {center.address}</p>}
        {center.phone && <p>Điện thoại: {center.phone}</p>}
      </div>
    </header>
  );
}

/** Một dòng "Nhãn: giá trị" trên giấy in. */
export function PrintRow({ label, children, strong }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex gap-2 py-0.5">
      <dt className="w-36 shrink-0 text-muted-foreground print:text-black">{label}</dt>
      <dd className={strong ? "min-w-0 font-semibold break-words" : "min-w-0 break-words"}>{children}</dd>
    </div>
  );
}

/** Khung một tờ giấy in: nền trắng, chữ đen, mỗi tờ một trang khi in. */
export function PrintSheet({ children }: { children: React.ReactNode }) {
  return (
    <article className="mx-auto grid w-full max-w-2xl gap-4 rounded-lg border bg-white p-4 text-sm text-black sm:p-6 print:max-w-none print:break-after-page print:rounded-none print:border-0 print:p-0">
      {children}
    </article>
  );
}
