export const TIME_ZONE = "Asia/Ho_Chi_Minh";

/** "2026-10-05" → "05/10/2026" */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value: Date | null | undefined): string {
  if (!value) return "";
  return new Intl.DateTimeFormat("vi-VN", { timeZone: TIME_ZONE, dateStyle: "short", timeStyle: "short" }).format(value);
}

/** "08:00:00" → "08:00" */
export const formatTime = (time: string | null | undefined) => (time ? time.slice(0, 5) : "");

/** Ngày hiện tại theo giờ Việt Nam, dạng "yyyy-mm-dd". */
export function todayIso(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(now);
}

export const LABELS = {
  teacherStatus: { active: "Đang dạy", inactive: "Ngừng dạy" },
  studentStatus: { active: "Đang học", paused: "Tạm nghỉ", left: "Đã nghỉ" },
  gender: { male: "Nam", female: "Nữ", other: "Khác" },
  classStatus: { open: "Đang mở", closed: "Đã đóng" },
  classTeacherRole: { main: "GV chính", assistant: "Trợ giảng" },
  enrollmentStatus: { active: "Đang học", left: "Đã rời lớp" },
  role: { admin: "Quản trị", teacher: "Giáo viên" },
} as const;

export const toOptions = (labels: Record<string, string>) =>
  Object.entries(labels).map(([value, label]) => ({ value, label }));
