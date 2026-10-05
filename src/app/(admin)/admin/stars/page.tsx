import type { Metadata } from "next";
import Link from "next/link";
import { ConfirmButton, FormDialogButton } from "@/components/action-buttons";
import { AvatarBadge } from "@/components/avatar";
import { CrudSection } from "@/components/crud-section";
import type { Field } from "@/components/form-dialog";
import { Badge } from "@/components/ui/badge";
import { formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  createCriteriaAction,
  createLevelAction,
  deleteCriteriaAction,
  deleteLevelAction,
  giftAvatarAction,
  undoStarAction,
  updateAvatarAction,
  updateCriteriaAction,
  updateLevelAction,
} from "@/server/actions/stars";
import { listAvatarCatalog, listGiftedAvatars } from "@/server/services/avatars";
import { listCriteria, listRecentStarLogs, loadLevels } from "@/server/services/stars";
import { listStudents } from "@/server/services/students";
import { requirePageUser } from "@/server/session";

export const metadata: Metadata = { title: "Sao & Avatar" };

const TABS = [
  { key: "criteria", label: "Tiêu chí" },
  { key: "levels", label: "Cấp bậc" },
  { key: "avatars", label: "Kho avatar" },
  { key: "gifts", label: "Tặng avatar" },
  { key: "ledger", label: "Sổ cái" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const ACTIVE_OPTIONS = [
  { value: "true", label: "Đang dùng" },
  { value: "false", label: "Ngừng dùng" },
];
const NEUTRAL_FRAME = "#d4d4d8";

export default async function StarsAdminPage({ searchParams }: PageProps<"/admin/stars">) {
  const { actor } = await requirePageUser("admin");
  const raw = (await searchParams).tab;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  const tab: TabKey = TABS.find((t) => t.key === requested)?.key ?? "criteria";

  return (
    <div className="grid gap-4">
      <h1 className="text-lg font-semibold">Sao, cấp bậc & avatar</h1>
      <nav aria-label="Mục" className="flex gap-1 overflow-x-auto rounded-lg border p-0.5 text-sm">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/stars?tab=${t.key}`}
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
      {tab === "criteria" && <CriteriaTab actor={actor} />}
      {tab === "levels" && <LevelsTab />}
      {tab === "avatars" && <AvatarsTab actor={actor} />}
      {tab === "gifts" && <GiftsTab actor={actor} />}
      {tab === "ledger" && <LedgerTab actor={actor} />}
    </div>
  );
}

type TabProps = { actor: Awaited<ReturnType<typeof requirePageUser>>["actor"] };

async function CriteriaTab({ actor }: TabProps) {
  const criteria = await listCriteria(actor, false);
  const fields: Field[] = [
    { name: "name", label: "Tên tiêu chí", required: true },
    { name: "stars", label: "Số sao", type: "number", required: true, hint: "Số dương = thưởng, số âm = trừ sao." },
    { name: "active", label: "Trạng thái", type: "select", required: true, options: ACTIVE_OPTIONS, defaultValue: "true" },
  ];
  return (
    <CrudSection
      title="Tiêu chí sao"
      columns={["Tiêu chí", "Số sao", "Loại", "Trạng thái"]}
      rows={criteria.map((c) => ({
        id: c.id,
        cells: [c.name, c.stars > 0 ? `+${c.stars}` : String(c.stars), c.type === "reward" ? "Thưởng" : "Trừ sao", c.active ? "Đang dùng" : "Ngừng dùng"],
        values: { name: c.name, stars: String(c.stars), active: String(c.active) },
      }))}
      fields={fields}
      createAction={createCriteriaAction}
      updateAction={updateCriteriaAction}
      deleteAction={deleteCriteriaAction}
    />
  );
}

async function LevelsTab() {
  const levels = await loadLevels();
  const fields: Field[] = [
    { name: "levelNo", label: "Cấp số", type: "number", required: true, hint: "Không đổi được sau khi tạo." },
    { name: "name", label: "Tên cấp", required: true },
    { name: "minStars", label: "Số sao tối thiểu", type: "number", required: true },
    { name: "frameColor", label: "Màu khung viền (#RRGGBB)", required: true, defaultValue: "#ffd700" },
  ];
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Cấp của học viên suy ra trực tiếp từ tổng sao toàn thời gian. Đổi mốc sao sẽ đổi cấp ngay và có thể khóa avatar đang dùng.
      </p>
      <div className="flex flex-wrap gap-3">
        {levels.map((l) => (
          <span key={l.id} className="flex items-center gap-2 text-sm">
            <AvatarBadge avatar={null} frameColor={l.frameColor} size={20} /> {l.name}
          </span>
        ))}
      </div>
      <CrudSection
        title="Cấp bậc"
        columns={["Tên cấp", "Cấp số", "Từ số sao", "Màu khung"]}
        rows={levels.map((l) => ({
          id: l.id,
          cells: [l.name, String(l.levelNo), String(l.minStars), l.frameColor],
          values: { levelNo: String(l.levelNo), name: l.name, minStars: String(l.minStars), frameColor: l.frameColor },
        }))}
        fields={fields}
        createAction={createLevelAction}
        updateAction={updateLevelAction}
        deleteAction={deleteLevelAction}
      />
    </div>
  );
}

async function AvatarsTab({ actor }: TabProps) {
  const [avatars, levels] = await Promise.all([listAvatarCatalog(actor), loadLevels()]);
  const levelOptions = levels.map((l) => ({ value: l.id, label: `Cấp ${l.levelNo} · ${l.name} (${l.minStars} sao)` }));
  const colorOf = (levelId: string | null) => levels.find((l) => l.id === levelId)?.frameColor ?? NEUTRAL_FRAME;
  return (
    <section className="grid gap-3">
      <h2 className="text-lg font-semibold">
        Kho avatar <span className="text-sm font-normal text-muted-foreground">({avatars.length})</span>
      </h2>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {avatars.map((a) => (
          <li key={a.id} className={cn("flex flex-col items-center gap-2 rounded-lg border p-3 text-center text-sm", !a.active && "bg-muted/40")}>
            <AvatarBadge avatar={a} frameColor={colorOf(a.requiredLevelId)} size={56} locked={!a.active} className="mt-1" />
            <span className="font-medium">{a.name}</span>
            <span className="text-xs text-muted-foreground">
              {a.unlockType === "gifted" ? "Tặng riêng" : `Cấp ${a.requiredLevelNo} · cần ${a.requiredMinStars} sao`}
            </span>
            {!a.active && <Badge variant="outline">Ngừng dùng</Badge>}
            <FormDialogButton
              label="Sửa"
              variant="outline"
              className="h-9 w-full"
              title={`Sửa avatar ${a.name}`}
              fields={[
                { name: "name", label: "Tên", required: true },
                ...(a.unlockType === "by_level"
                  ? ([{ name: "requiredLevelId", label: "Cấp yêu cầu", type: "select", required: true, options: levelOptions }] as Field[])
                  : []),
                { name: "active", label: "Trạng thái", type: "select", required: true, options: ACTIVE_OPTIONS },
              ]}
              initial={{ name: a.name, requiredLevelId: a.requiredLevelId ?? "", active: String(a.active) }}
              action={updateAvatarAction.bind(null, a.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function GiftsTab({ actor }: TabProps) {
  const [{ gifted, given }, students] = await Promise.all([listGiftedAvatars(actor), listStudents(actor)]);
  return (
    <section className="grid gap-3">
      <p className="text-sm text-muted-foreground">Avatar tặng riêng không phụ thuộc cấp và không mất khi học viên tụt cấp.</p>
      {gifted.map((g) => {
        const recipients = given.filter((x) => x.avatarId === g.id);
        return (
          <div key={g.id} className="grid gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <AvatarBadge avatar={g} frameColor={NEUTRAL_FRAME} size={48} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{g.name}</p>
                <p className="text-sm text-muted-foreground">Đã tặng {recipients.length} học viên</p>
              </div>
              <FormDialogButton
                label="Tặng"
                title={`Tặng avatar ${g.name}`}
                fields={[
                  {
                    name: "studentId",
                    label: "Học viên",
                    type: "select",
                    required: true,
                    options: students
                      .filter((s) => s.status !== "left" && !recipients.some((r) => r.studentCode === s.code))
                      .map((s) => ({ value: s.id, label: `${s.code} – ${s.fullName}` })),
                  },
                ]}
                fixed={{ avatarId: g.id }}
                action={giftAvatarAction}
                submitLabel="Tặng"
                successMessage="Đã tặng avatar."
              />
            </div>
            {recipients.length > 0 && (
              <ul className="flex flex-wrap gap-1 text-sm">
                {recipients.map((r) => (
                  <li key={r.id}>
                    <Badge variant="secondary" className="h-auto py-0.5">
                      {r.studentName} · {formatDate(r.giftedAt.toISOString())}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </section>
  );
}

async function LedgerTab({ actor }: TabProps) {
  const logs = await listRecentStarLogs(actor);
  return (
    <section className="grid gap-2">
      <p className="text-sm text-muted-foreground">
        Sổ cái chỉ thêm, không sửa hay xóa. Hoàn tác tạo một bản ghi đảo dấu. Hiển thị {logs.length} bản ghi gần nhất.
      </p>
      {logs.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Chưa có lần ghi sao nào.</p>
      ) : (
        <ul className="grid gap-1.5">
          {logs.map((log) => (
            <li key={log.id} className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm", log.reversed && "opacity-60")}>
              <span className={cn("w-9 shrink-0 font-semibold tabular-nums", log.stars > 0 ? "text-emerald-600" : "text-red-600")}>
                {log.stars > 0 ? `+${log.stars}` : log.stars}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("font-medium", log.reversed && "line-through")}>
                  {log.studentName} <span className="font-normal text-muted-foreground">{log.studentCode}</span>
                </span>
                <span className="block text-xs text-muted-foreground">
                  {log.isReversal ? "Hoàn tác: " : ""}
                  {log.criteriaName ?? "—"} · {log.classCode ?? ""} {log.sessionDate ? formatDate(log.sessionDate) : ""} · {log.recordedByName ?? "?"} ·{" "}
                  {formatDateTime(log.recordedAt)}
                </span>
              </span>
              {!log.isReversal && !log.reversed && (
                <ConfirmButton
                  label="Hoàn tác"
                  className="h-9 shrink-0"
                  confirmText={`Hoàn tác ${log.stars > 0 ? "+" : ""}${log.stars} sao của ${log.studentName}?`}
                  action={undoStarAction}
                  input={{ logId: log.id }}
                  successMessage="Đã hoàn tác."
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
