"use client";

import { useState } from "react";
import { ExportLinks } from "@/components/class-report";
import { selectClass } from "@/components/form-dialog";

/** Xuất Thời khóa biểu: chọn loại lớp (lớp Robotics của trung tâm hoặc Lớp học thêm) trước khi tải tệp. */
export function TimetableExport({ baseHref }: { baseHref: string }) {
  const [kind, setKind] = useState<"regular" | "extra">("regular");
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        className={`${selectClass} h-10 w-auto`}
        value={kind}
        aria-label="Loại lớp cần xuất"
        onChange={(event) => setKind(event.target.value === "extra" ? "extra" : "regular")}
      >
        <option value="regular">Lớp Robotics</option>
        <option value="extra">Lớp học thêm</option>
      </select>
      <ExportLinks label="Xuất khoảng đang xem" baseHref={`${baseHref}&kind=${kind}`} />
    </div>
  );
}
