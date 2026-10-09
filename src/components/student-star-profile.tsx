import { BackLink } from "@/components/back-link";
import { ConfirmButton, FormDialogButton } from "@/components/action-buttons";
import { AvatarBadge, LevelProgress } from "@/components/avatar";
import { AvatarPicker } from "@/components/avatar-picker";
import { Badge } from "@/components/ui/badge";
import { LABELS, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cancelRedemptionAction, redeemGiftAction } from "@/server/actions/rewards";
import { deleteStarLogsAction, giftAvatarAction } from "@/server/actions/stars";
import type { Actor } from "@/server/guard";
import { orNotFound } from "@/server/page";
import { listGiftedAvatars } from "@/server/services/avatars";
import { getRedemptionInfo } from "@/server/services/redemptions";
import { getStudentStarProfile } from "@/server/services/stars";

/** Hồ sơ sao & avatar của một học viên, dùng chung cho Admin và GV (service kiểm tra quyền). */
export async function StudentStarProfile({ actor, studentId, backHref }: { actor: Actor; studentId: string; backHref: string }) {
  const profile = await orNotFound(getStudentStarProfile(actor, studentId));
  const { student, progress } = profile;
  // getStudentStarProfile đã kiểm tra quyền xem học viên này.
  const redemption = await getRedemptionInfo(actor, studentId);
  const admin = actor.role === "admin";
  const attended = profile.attendance.filter((a) => a.status === "present" || a.status === "late" || a.status === "left_early").length;
  const giftable =
    actor.role === "admin"
      ? (await listGiftedAvatars(actor)).gifted.filter((g) => !progress.giftedAvatarIds.includes(g.id))
      : [];

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <div className="grid gap-3">
        <BackLink href={backHref}>Quay lại</BackLink>
        <div className="flex items-center gap-4">
          <AvatarBadge avatar={progress.avatar} frameColor={progress.level.frameColor} size={72} />
          <div className="grid min-w-0 flex-1 gap-1">
            <h1 className="text-xl font-semibold break-words">
              {student.fullName} <span className="text-sm font-normal text-muted-foreground">{student.code}</span>
            </h1>
            <LevelProgress progress={progress} />
          </div>
        </div>
        <dl className="grid grid-cols-3 gap-2 text-center text-sm">
          {[
            { label: "Tổng sao tích lũy", value: redemption.total },
            { label: "Đã đổi quà", value: redemption.spent },
            { label: "Sao còn lại", value: redemption.balance },
          ].map((item) => (
            <div key={item.label} className="glass-solid rounded-xl border p-2">
              <dt className="text-xs text-muted-foreground">{item.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <section className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-medium">Avatar</h2>
          {giftable.length > 0 && (
            <FormDialogButton
              label="Tặng avatar"
              variant="outline"
              title={`Tặng avatar cho ${student.fullName}`}
              description="Avatar tặng riêng không mất khi học viên tụt cấp."
              fields={[
                { name: "avatarId", label: "Avatar", type: "select", required: true, options: giftable.map((g) => ({ value: g.id, label: g.name })) },
              ]}
              fixed={{ studentId }}
              action={giftAvatarAction}
              submitLabel="Tặng"
              successMessage="Đã tặng avatar."
            />
          )}
        </div>
        <AvatarPicker studentId={studentId} currentId={progress.avatar?.id ?? null} frameColor={progress.level.frameColor} avatars={profile.avatars} />
      </section>

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">Quà</h2>
          {redemption.canRedeem && redemption.options.length > 0 && (
            <FormDialogButton
              label="Đổi quà"
              title={`Đổi quà cho ${student.fullName}`}
              description={`Sao còn lại: ${redemption.balance}. Đổi quà trừ số sao theo mốc quà; tổng sao tích lũy và cấp bậc không đổi.`}
              fields={[
                {
                  name: "tierId",
                  label: "Quà",
                  type: "select",
                  required: true,
                  options: redemption.options.map((o) => ({ value: o.tierId, label: `${o.giftName} – ${o.minStars} sao (còn ${o.stock})` })),
                },
              ]}
              fixed={{ studentId }}
              action={redeemGiftAction}
              submitLabel="Đổi quà"
              successMessage="Đã đổi quà."
            />
          )}
        </div>
        {redemption.canRedeem && redemption.options.length === 0 && (
          <p className="text-sm text-muted-foreground">Chưa có quà nào đổi được: chưa đủ sao theo mốc quà, kho hết quà, hoặc lớp chưa có mốc quà.</p>
        )}
        {redemption.history.length > 0 && (
          <ul className="grid gap-1.5">
            {redemption.history.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 glass-solid rounded-xl border px-3 py-2 text-sm">
                <span className="min-w-0">
                  {r.giftName}
                  <span className="block text-xs text-muted-foreground">
                    {r.classCode ? `Lớp ${r.classCode} · ` : ""}đổi lúc {formatDateTime(r.redeemedAt)}
                    {r.redeemedByName ? ` · ${r.redeemedByName}` : ""}
                  </span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="font-semibold text-red-600 tabular-nums">−{r.stars} sao</span>
                  {admin && (
                    <ConfirmButton
                      label="Hủy"
                      className="h-9"
                      confirmText={`Hủy lần đổi quà "${r.giftName}"? Học viên được trả lại ${r.stars} sao và kho được cộng lại 1 quà.`}
                      action={cancelRedemptionAction}
                      input={{ id: r.id }}
                      successMessage="Đã hủy lần đổi quà."
                    />
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {profile.gifts.length === 0 ? (
          redemption.history.length === 0 && (
            <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">Chưa đổi quà.</p>
          )
        ) : (
          <ul className="grid gap-1.5">
            {profile.gifts.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 glass-solid rounded-xl border px-3 py-2 text-sm">
                <span className="min-w-0">
                  {g.giftName} <span className="text-muted-foreground">· quà tổng kết lớp {g.classCode}</span>
                </span>
                <Badge variant={g.status === "given" ? "secondary" : "outline"}>
                  {LABELS.handoverStatus[g.status]}
                  {g.givenAt ? ` ${formatDateTime(g.givenAt)}` : ""}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <h2 className="font-medium">
          Buổi đã học{" "}
          <span className="text-sm font-normal text-muted-foreground">
            (có mặt {attended}/{profile.attendance.length} buổi đã điểm danh)
          </span>
        </h2>
        {profile.attendance.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">Chưa có buổi nào được điểm danh.</p>
        ) : (
          <ul className="grid gap-1.5">
            {profile.attendance.map((a) => (
              <li key={a.sessionId} className="flex flex-wrap items-center justify-between gap-2 glass-solid rounded-xl border px-3 py-2 text-sm">
                <span className="min-w-0">
                  {formatDate(a.date)} <span className="text-muted-foreground">· {a.classCode}</span>
                </span>
                <span className="flex items-center gap-2">
                  {a.stars !== 0 && (
                    <span className={cn("font-semibold tabular-nums", a.stars > 0 ? "text-emerald-600" : "text-red-600")}>
                      {a.stars > 0 ? `+${a.stars}` : a.stars} sao
                    </span>
                  )}
                  <Badge variant={a.status === "absent" || a.status === "excused" ? "outline" : "secondary"}>{LABELS.attendanceStatus[a.status]}</Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-medium">
            Lịch sử ghi sao <span className="text-sm font-normal text-muted-foreground">({profile.logs.length} lần gần nhất)</span>
          </h2>
          {/* Chỉ Admin xóa hẳn lịch sử sao (ghi nhầm, dữ liệu thử); máy chủ kiểm tra lại. */}
          {admin && profile.logs.length > 0 && (
            <ConfirmButton
              label="Xóa hết"
              variant="destructive"
              className="h-9"
              confirmText={`Xóa hẳn toàn bộ lịch sử sao của ${student.fullName}? Tổng sao, cấp và avatar được tính lại. Sao thuộc lớp đã đóng được giữ. Không hoàn tác được.`}
              action={deleteStarLogsAction}
              input={{ studentId }}
              successMessage="Đã xóa lịch sử sao."
            />
          )}
        </div>
        {profile.logs.length === 0 ? (
          <p className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground">Chưa có lần ghi sao nào.</p>
        ) : (
          <ul className="grid gap-1.5">
            {profile.logs.map((log) => (
              <li key={log.id} className={cn("flex items-center gap-2 glass-solid rounded-xl border px-3 py-2 text-sm", log.reversed && "opacity-60")}>
                <span className={cn("w-9 shrink-0 font-semibold tabular-nums", log.stars > 0 ? "text-emerald-600" : "text-red-600")}>
                  {log.stars > 0 ? `+${log.stars}` : log.stars}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn(log.reversed && "line-through")}>
                    {log.isReversal ? "Hoàn tác: " : ""}
                    {log.criteriaName ?? "—"}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {log.classCode ?? ""} {log.sessionDate ? `· buổi ${formatDate(log.sessionDate)}` : ""} · ghi lúc {formatDateTime(log.recordedAt)}
                    {log.note && !log.isReversal ? ` · ${log.note}` : ""}
                  </span>
                </span>
                {admin && (
                  <ConfirmButton
                    label="Xóa"
                    className="h-9 shrink-0"
                    confirmText={`Xóa hẳn lần ghi ${log.stars > 0 ? `+${log.stars}` : log.stars} sao này${log.isReversal || log.reversed ? " (cùng lần ghi/hoàn tác đi kèm)" : ""}? Không hoàn tác được.`}
                    action={deleteStarLogsAction}
                    input={{ studentId, logId: log.id }}
                    successMessage="Đã xóa lần ghi sao."
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
