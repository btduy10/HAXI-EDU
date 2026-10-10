"use client";

import { createContext, useContext, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormDialog } from "@/components/form-dialog";
import { assignMakeupAction } from "@/server/actions/admin";

/** Một buổi có thể học bù; `label` đã ghi đủ ngày, giờ, lớp, giáo viên, sĩ số. */
export type MakeupTarget = { id: string; classId: string; label: string };
type Absence = { absentSessionId: string; studentId: string; studentName: string; absentLabel: string };

const PlannerContext = createContext<((absence: Absence) => void) | null>(null);

/**
 * Bọc quanh danh sách "Cần học bù": giữ một hộp thoại "xếp bù" dùng chung,
 * mỗi buổi vắng chỉ cần gọi mở với học viên và buổi vắng của mình.
 */
export function MakeupPlanner({
  targets,
  activeClassIds,
  children,
}: {
  targets: MakeupTarget[];
  /** Lớp đang học của từng học viên: buổi của chính các lớp đó không dùng để học bù (em vốn đã có tên). */
  activeClassIds: Record<string, string[]>;
  children: React.ReactNode;
}) {
  const [absence, setAbsence] = useState<Absence | null>(null);
  const own = new Set(absence ? activeClassIds[absence.studentId] : []);
  const options = targets.filter((t) => !own.has(t.classId) && t.id !== absence?.absentSessionId).map((t) => ({ value: t.id, label: t.label }));

  return (
    <PlannerContext.Provider value={setAbsence}>
      {children}
      {absence && (
        <FormDialog
          open
          onOpenChange={(open) => !open && setAbsence(null)}
          title={`Xếp học bù cho ${absence.studentName}`}
          description={
            options.length === 0
              ? `Bù cho buổi vắng ${absence.absentLabel}. Chưa có buổi nào trong 4 tuần tới để học bù.`
              : `Bù cho buổi vắng ${absence.absentLabel}. Chọn một buổi sắp tới của lớp khác; em sẽ có tên trong bảng điểm danh của buổi đó với nhãn “Học bù”.`
          }
          fields={[{ name: "makeupSessionId", label: "Buổi học bù", type: "select", required: true, options }]}
          submitLabel="Xếp bù"
          successMessage="Đã xếp học bù."
          onSubmit={(values) => assignMakeupAction({ ...values, absentSessionId: absence.absentSessionId, studentId: absence.studentId })}
        />
      )}
    </PlannerContext.Provider>
  );
}

/** Nút "Xếp bù" / "Xếp lại" của một buổi vắng. Không hiển thị nếu không nằm trong MakeupPlanner. */
export function AssignMakeupButton({ label, ...absence }: Absence & { label: string }) {
  const open = useContext(PlannerContext);
  if (!open) return null;
  return (
    <Button type="button" variant="outline" className="h-10" aria-label={`${label} cho ${absence.studentName}, buổi ${absence.absentLabel}`} onClick={() => open(absence)}>
      {label}
    </Button>
  );
}
