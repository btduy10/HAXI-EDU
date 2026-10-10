// Học bù bằng cách học ghép vào một buổi có sẵn: trạng thái của một buổi vắng.

type AttendanceStatus = "present" | "excused" | "absent" | "late" | "left_early";

/**
 * - `pending`: chưa xếp buổi bù.
 * - `scheduled`: đã xếp, buổi bù chưa điểm danh.
 * - `done`: đã học bù (có mặt, đi trễ hoặc về sớm ở buổi bù).
 * - `missed`: vắng cả buổi bù, xếp lại được.
 * - `cancelled`: buổi bù đã bị hủy, xếp lại được.
 */
export type MakeupState = "pending" | "scheduled" | "done" | "missed" | "cancelled";

export const MAKEUP_STATE_LABELS: Record<MakeupState, string> = {
  pending: "Chưa xếp bù",
  scheduled: "Đã xếp bù",
  done: "Đã bù",
  missed: "Vắng buổi bù",
  cancelled: "Buổi bù đã hủy",
};

/** Buổi vắng là các tình trạng điểm danh cần học bù. */
export const isAbsence = (status: AttendanceStatus) => status === "absent" || status === "excused";

export function makeupState(makeup: { sessionStatus: "planned" | "done" | "cancelled"; attendance: AttendanceStatus | null } | null): MakeupState {
  if (!makeup) return "pending";
  if (makeup.sessionStatus === "cancelled") return "cancelled";
  if (!makeup.attendance) return "scheduled";
  return isAbsence(makeup.attendance) ? "missed" : "done";
}

/** Buổi vắng còn xếp (lại) buổi bù được: chưa xếp, vắng buổi bù, hoặc buổi bù đã hủy. */
export const canAssignMakeup = (state: MakeupState) => state === "pending" || state === "missed" || state === "cancelled";

/** Số ngày lùi lại khi liệt kê các buổi vắng cần học bù, và số ngày tới khi liệt kê các buổi có thể học bù. */
export const MAKEUP_LOOKBACK_DAYS = 90;
export const MAKEUP_AHEAD_DAYS = 28;
