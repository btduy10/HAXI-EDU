import type { Metadata } from "next";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { LinkButton } from "@/components/link-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WEEKDAY_SHORT, addMonths, endOfMonth, isoWeekday, parseIsoDate, startOfMonth } from "@/lib/dates";
import { formatDate, formatTime, todayIso } from "@/lib/format";
import { listTeachers } from "@/server/services/catalog";
import { listClasses } from "@/server/services/classes";
import { type TimesheetState, teacherTimesheet } from "@/server/services/timesheet";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Chấm công" };

const STATE_LABEL: Record<TimesheetState, string> = { taught: "Đã dạy", pending: "Chưa điểm danh", upcoming: "Chưa tới ngày" };
const hours = (minutes: number) => (minutes / 60).toLocaleString("vi-VN", { maximumFractionDigits: 1 });

export default async function TimesheetPage({ searchParams }: PageProps<"/admin/timesheet">) {
  const { actor } = await requirePageUser("admin");
  const params = await searchParams;
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value) || undefined;
  };
  const [teachers, classes] = await Promise.all([listTeachers(actor), listClasses(actor)]);
  // Chỉ nhận id có trong danh sách (tránh truy vấn với giá trị tùy ý).
  const teacher = teachers.find((t) => t.id === one("teacherId")) ?? null;
  const cls = classes.find((c) => c.id === one("classId")) ?? null;

  // Mặc định: tháng hiện tại. Chọn lớp mà chưa nhập ngày thì lấy trọn thời gian của lớp (tính công theo khóa).
  const today = todayIso();
  const from = parseIsoDate(one("from"), cls ? cls.startDate : startOfMonth(today));
  const requestedTo = parseIsoDate(one("to"), cls ? cls.endDate : endOfMonth(today));
  const to = requestedTo < from ? from : requestedTo;

  const { rows, summary } = await teacherTimesheet(actor, { from, to, teacherId: teacher?.id, classId: cls?.id });
  const total = summary.reduce(
    (sum, s) => ({ taught: sum.taught + s.taught, substitute: sum.substitute + s.substitute, minutes: sum.minutes + s.minutes, pending: sum.pending + s.pending }),
    { taught: 0, substitute: 0, minutes: 0, pending: 0 },
  );

  const href = (range: { from: string; to: string }) => {
    const query = new URLSearchParams(range);
    if (teacher) query.set("teacherId", teacher.id);
    if (cls) query.set("classId", cls.id);
    return `/admin/timesheet?${query}`;
  };
  const lastMonth = addMonths(today, -1);

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-lg font-semibold">Chấm công giáo viên</h1>
        <p className="text-sm text-muted-foreground">
          Mỗi buổi đã điểm danh là một công, tính cho người thực dạy (giáo viên dạy thay nếu có). Buổi đã hủy không tính.
        </p>
      </div>

      <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <label className="grid gap-1.5 text-sm font-medium">
          Từ ngày
          <Input type="date" name="from" defaultValue={from} className="h-11" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Đến ngày
          <Input type="date" name="to" defaultValue={to} className="h-11" />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Giáo viên
          <AutoSubmitSelect name="teacherId" defaultValue={teacher?.id ?? ""}>
            <option value="">Tất cả giáo viên</option>
            {teachers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.code} – {t.fullName}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Lớp (tính theo khóa)
          <AutoSubmitSelect name="classId" defaultValue={cls?.id ?? ""} clearOnChange={["from", "to"]}>
            <option value="">Tất cả lớp</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} – {c.name}
              </option>
            ))}
          </AutoSubmitSelect>
        </label>
        <Button type="submit" variant="outline" className="h-11">
          Xem
        </Button>
      </form>
      <div className="flex flex-wrap gap-2">
        <LinkButton variant="outline" className="h-9" href={href({ from: startOfMonth(today), to: endOfMonth(today) })}>
          Tháng này
        </LinkButton>
        <LinkButton variant="outline" className="h-9" href={href({ from: lastMonth, to: endOfMonth(lastMonth) })}>
          Tháng trước
        </LinkButton>
        {cls && (
          <LinkButton variant="outline" className="h-9" href={href({ from: cls.startDate, to: cls.endDate })}>
            Cả khóa của lớp {cls.code}
          </LinkButton>
        )}
      </div>

      <section className="grid gap-2">
        <h2 className="font-semibold">
          Tổng công từ {formatDate(from)} đến {formatDate(to)}
        </h2>
        {summary.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Không có buổi dạy nào trong khoảng thời gian này.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 text-center">STT</TableHead>
                  <TableHead>Giáo viên</TableHead>
                  <TableHead className="text-center">Số công</TableHead>
                  <TableHead className="text-center">Trong đó dạy thay</TableHead>
                  <TableHead className="text-center">Số giờ</TableHead>
                  <TableHead className="text-center">Chưa điểm danh</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {summary.map((s, index) => (
                  <TableRow key={s.teacherId}>
                    <TableCell className="text-center text-muted-foreground tabular-nums">{index + 1}</TableCell>
                    <TableCell className="whitespace-normal">
                      {s.teacherName} <span className="text-muted-foreground">({s.teacherCode})</span>
                    </TableCell>
                    <TableCell className="text-center font-semibold tabular-nums">{s.taught}</TableCell>
                    <TableCell className="text-center tabular-nums">{s.substitute}</TableCell>
                    <TableCell className="text-center tabular-nums">{hours(s.minutes)}</TableCell>
                    <TableCell className="text-center tabular-nums">{s.pending}</TableCell>
                  </TableRow>
                ))}
                {summary.length > 1 && (
                  <TableRow className="font-semibold">
                    <TableCell />
                    <TableCell>Tổng cộng</TableCell>
                    <TableCell className="text-center tabular-nums">{total.taught}</TableCell>
                    <TableCell className="text-center tabular-nums">{total.substitute}</TableCell>
                    <TableCell className="text-center tabular-nums">{hours(total.minutes)}</TableCell>
                    <TableCell className="text-center tabular-nums">{total.pending}</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {rows.length > 0 && (
        <section className="grid gap-2">
          <h2 className="font-semibold">
            Chi tiết buổi dạy <span className="text-sm font-normal text-muted-foreground">({rows.length})</span>
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-14 text-center">STT</TableHead>
                  <TableHead>Ngày</TableHead>
                  <TableHead>Giờ</TableHead>
                  <TableHead>Giáo viên</TableHead>
                  <TableHead>Lớp</TableHead>
                  <TableHead>Khóa học</TableHead>
                  <TableHead>Phòng</TableHead>
                  <TableHead>Trạng thái</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, index) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-center text-muted-foreground tabular-nums">{index + 1}</TableCell>
                    <TableCell>
                      {WEEKDAY_SHORT[isoWeekday(r.date)]}, {formatDate(r.date)}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {formatTime(r.startTime)}–{formatTime(r.endTime)}
                    </TableCell>
                    <TableCell>
                      {r.teacherName}
                      {r.isSubstitute && (
                        <Badge variant="outline" className="ml-1">
                          Dạy thay
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {r.classCode}
                      {r.kind === "makeup" && (
                        <Badge variant="outline" className="ml-1">
                          Buổi bù
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>{r.courseName}</TableCell>
                    <TableCell>{r.roomName ?? ""}</TableCell>
                    <TableCell>
                      <Badge variant={r.state === "taught" ? "default" : r.state === "pending" ? "destructive" : "secondary"}>
                        {STATE_LABEL[r.state]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}
