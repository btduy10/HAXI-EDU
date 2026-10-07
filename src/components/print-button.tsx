"use client";

import { PrinterIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Nút in trang hiện tại (giấy báo học phí, phiếu thu). Tự ẩn trên bản in. */
export function PrintButton({ label = "In" }: { label?: string }) {
  return (
    <Button type="button" className="h-10 print:hidden" onClick={() => window.print()}>
      <PrinterIcon /> {label}
    </Button>
  );
}
