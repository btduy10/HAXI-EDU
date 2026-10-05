import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton } from "@/components/action-buttons";
import { ClassReportTable, ExportLinks } from "@/components/class-report";
import { CrudSection } from "@/components/crud-section";
import { type Field, selectClass } from "@/components/form-dialog";
import { RewardApproval } from "@/components/reward-approval";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LABELS, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  closeClassAction,
  createGiftAction,
  createTierAction,
  deleteGiftAction,
  deleteTierAction,
  updateGiftAction,
} from "@/server/actions/rewards";
import type { Actor } from "@/server/guard";
import { listCourses } from "@/server/services/catalog";
import { listClasses } from "@/server/services/classes";
import { getClassReport, getClassSummary, listGifts, listTiers } from "@/server/services/summaries";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Quà tặng & Tổng kết" };

const TABS = [
  { key: "summary", label: "Tổng kết lớp" },
  { key: "tiers", label: "Mốc quà" },
  { key: "gifts", label: "Kho quà" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function RewardsPage({ searchParams }: PageProps<"/admin/rewards">) {
  const { actor } = await requirePageUser("admin");
  const params = await searchParams;
  const tab: TabKey = TABS.find((t) => t.key === one(params.tab))?.key ?? "summary";

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold">Quà tặng & Tổng kết</h1>
      <nav aria-label="Mục" className="flex gap-1 overflow-x-auto rounded-lg border p-0.5 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/rewards?tab=${t.key}`}
            aria-current={tab === t.key ? "page" : undefined}
            className={cn(
              "flex min-h-10 shrink-0 items-center rounded-md px-3 font-medium whitespace-nowrap",
              tab === t.key ? "bg-primary text-primary-foreground" : "hover:bg-muted",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {tab === "summary" && <SummaryTab actor={actor} classId={one(params.classId)} />}
      {tab === "tiers" && <TiersTab actor={actor} />}
      {tab === "gifts" && <GiftsTab actor={actor} />}
    </div>
  );
}

async function GiftsTab({ actor }: { actor: Actor }) {
  const gifts = await listGifts(actor);
  const fields: Field[] = [
    { name: "name", label: "Tên quà", required: true },
    { name: "stock", label: "Tồn kho", type: "number", required: true, defaultValue: "0" },
    { name: "description", label: "Mô tả", type: "textarea" },
  ];
  return (
    <CrudSection
      title="Quà tặng"
      columns={["Tên quà", "Tồn kho", "Mô tả"]}
      rows={gifts.map((g) => ({
        id: g.id,
        cells: [g.name, String(g.stock), g.description ?? ""],
        values: { name: g.name, stock: String(g.stock), description: g.description ?? "" },
      }))}
      fields={fields}
      createAction={createGiftAction}
      updateAction={updateGiftAction}
      deleteAction={deleteGiftAction}
    />
  );
}

async function TiersTab({ actor }: { actor: Actor }) {
  const [tiers, gifts, courses, classes] = await Promise.all([listTiers(actor), listGifts(actor), listCourses(actor), listClasses(actor)]);
  const fields: Field[] = [
    { name: "courseId", label: "Áp dụng cho khóa học", type: "select", options: courses.map((c) => ({ value: c.id, label: c.name })) },
    {
      name: "classId",
      label: "…hoặc riêng cho lớp",
      type: "select",
      options: classes.map((c) => ({ value: c.id, label: `${c.code} – ${c.name}` })),
      hint: "Chọn đúng một trong hai. Lớp có mốc riêng thì không dùng mốc của khóa học.",
    },
    { name: "minStars", label: "Từ số sao của khóa", type: "number", required: true },
    { name: "giftId", label: "Quà", type: "select", required: true, options: gifts.map((g) => ({ value: g.id, label: g.name })) },
  ];
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Học viên nhận quà của mốc cao nhất mà tổng sao trong khóa đạt tới (mỗi em một quà).
      </p>
      <CrudSection
        title="Mốc quà"
        columns={["Phạm vi", "Từ số sao", "Quà"]}
        rows={tiers.map((t) => ({
          id: t.id,
          cells: [t.classCode ? `Lớp ${t.classCode}` : `Khóa ${t.courseName ?? ""}`, String(t.minStars), t.giftName],
          values: {},
        }))}
        fields={fields}
        createAction={createTierAction}
        deleteAction={deleteTierAction}
        emptyText="Chưa có mốc quà."
      />
    </div>
  );
}

async function SummaryTab({ actor, classId }: { actor: Actor; classId: string }) {
  const classes = await listClasses(actor);
  // Chỉ nhận classId có trong danh sách lớp.
  const current = classes.find((c) => c.id === classId) ?? null;

  return (
    <div className="grid gap-4">
      <form className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input type="hidden" name="tab" value="summary" />
        <label className="grid flex-1 gap-1.5 text-sm font-medium">
          Lớp học
          <select name="classId" defaultValue={current?.id ?? ""} className={selectClass}>
            <option value="">— Chọn lớp —</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} – {c.name} ({LABELS.classStatus[c.status]})
              </option>
            ))}
          </select>
        </label>
        <Button type="submit" variant="outline" className="h-11">
          Xem
        </Button>
      </form>
      {current?.status === "open" && <OpenClassPreview actor={actor} classId={current.id} code={current.code} />}
      {current?.status === "closed" && <ClosedClassSummary actor={actor} classId={current.id} />}
    </div>
  );
}

async function OpenClassPreview({ actor, classId, code }: { actor: Actor; classId: string; code: string }) {
  const report = await getClassReport(actor, classId);
  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium">Số liệu tạm tính (lớp đang mở)</h2>
        <ConfirmButton
          label="Đóng lớp & chốt tổng kết"
          variant="default"
          confirmText={`Đóng lớp ${code} và chốt tổng kết?\n\nSau khi đóng: không điểm danh, ghi sao hay ghi danh thêm cho lớp này; các buổi tương lai còn lại sẽ bị hủy. Thao tác này không hoàn tác được.`}
          action={closeClassAction}
          input={{ classId }}
          successMessage="Đã đóng lớp và chốt tổng kết."
        />
      </div>
      <ClassReportTable rows={report.rows} sessions={report.sessions} />
    </section>
  );
}

async function ClosedClassSummary({ actor, classId }: { actor: Actor; classId: string }) {
  const summary = await getClassSummary(actor, classId);
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-medium">
            Tổng kết đã chốt <Badge variant="outline">Lớp đã đóng</Badge>
          </h2>
          {summary.finalizedAt && <p className="text-sm text-muted-foreground">Chốt lúc {formatDateTime(summary.finalizedAt)}</p>}
        </div>
        <ExportLinks baseHref={`/api/export/summary/${classId}`} label="In danh sách / xuất" />
      </div>

      <RewardApproval
        classId={classId}
        rows={summary.rows.map((r) => ({
          summaryId: r.summaryId,
          code: r.code,
          fullName: r.fullName,
          totalStars: r.totalStars,
          attendanceRate: r.attendanceRate,
          rank: r.rank,
          proposedGift: r.proposedGift?.name ?? null,
          handover: r.handover
            ? {
                id: r.handover.id,
                giftName: r.handover.giftName,
                status: r.handover.status,
                givenLabel: r.handover.givenAt ? `Trao lúc ${formatDateTime(r.handover.givenAt)} bởi ${r.handover.givenByName ?? "?"}` : null,
              }
            : null,
        }))}
      />

      <div className="grid gap-2">
        <h3 className="font-medium">Số lượng quà cần chuẩn bị</h3>
        {summary.giftNeeds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chưa có học viên nào đạt mốc quà. Kiểm tra mục Mốc quà.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {summary.giftNeeds.map((g) => (
              <li key={g.giftId} className="rounded-lg border p-3 text-sm">
                <p className="font-medium">{g.name}</p>
                <p className="text-muted-foreground">
                  Đủ điều kiện {g.eligible} · đã duyệt {g.approved} · đã trao {g.given} · tồn kho {g.stock}
                </p>
                {g.missing > 0 && <p className="font-medium text-destructive">Còn thiếu {g.missing} quà so với tồn kho</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
