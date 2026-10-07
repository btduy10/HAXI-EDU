import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLogs, enrollments, tuitionReceipts } from "@/db/schema";
import { DEFAULT_PERMISSIONS, type Menu, type MenuPermission } from "@/lib/permissions";
import type { Actor } from "@/server/guard";
import { deleteEnrollment } from "@/server/services/classes";
import * as svc from "@/server/services/tuition";
import { type Fixture, resetDb, seedFixture } from "./helpers";

let f: Fixture;
let a1: string; // lượt ghi danh của học viên A1 ở lớp A
let a2: string;
let b1: string;

const FULL: MenuPermission = { view: true, add: true, edit: true };
const withPerms = (actor: Actor, menus: Partial<Record<Menu, MenuPermission>>): Actor => ({
  ...actor,
  perms: { scope: "own", menus: { ...DEFAULT_PERMISSIONS.teacher!.menus, ...menus } },
});
const enrollmentOf = async (classId: string, studentId: string) =>
  (await db.select().from(enrollments).where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId))))[0]!.id;
const receipt = (enrollmentId: string, amount: number, extra: Partial<Parameters<typeof svc.createReceipt>[1]> = {}) => ({
  enrollmentId,
  amount,
  method: "cash" as const,
  paidAt: "2026-01-10",
  payerName: null,
  note: null,
  ...extra,
});
const rowOf = async (actor: Actor, enrollmentId: string) => (await svc.listTuition(actor, { enrollmentId })).rows[0]!;

beforeEach(async () => {
  await resetDb();
  f = await seedFixture();
  a1 = await enrollmentOf(f.classA.id, f.students[0]!.id);
  a2 = await enrollmentOf(f.classA.id, f.students[1]!.id);
  b1 = await enrollmentOf(f.classB.id, f.students[2]!.id);
});

describe("học phí", () => {
  it("lớp chưa đặt học phí thì chưa thu được; đặt học phí rồi theo dõi đã đóng / chưa đóng theo từng lần thu", async () => {
    expect((await rowOf(f.admin, a1)).status).toBe("unset");
    await expect(svc.createReceipt(f.admin, receipt(a1, 100_000))).rejects.toMatchObject({ code: "CONFLICT" });

    await svc.setClassFee(f.admin, { classId: f.classA.id, tuitionFee: 2_000_000 });
    expect(await rowOf(f.admin, a1)).toMatchObject({ fee: 2_000_000, due: 2_000_000, paid: 0, remaining: 2_000_000, status: "unpaid" });

    const first = await svc.createReceipt(f.admin, receipt(a1, 500_000, { method: "transfer", payerName: "Phụ huynh A1" }));
    expect(first.code).toBe("PT-000001");
    expect(await rowOf(f.admin, a1)).toMatchObject({ paid: 500_000, remaining: 1_500_000, status: "partial" });
    // Không thu vượt số còn lại.
    await expect(svc.createReceipt(f.admin, receipt(a1, 1_500_001))).rejects.toMatchObject({ code: "VALIDATION" });
    const second = await svc.createReceipt(f.admin, receipt(a1, 1_500_000));
    expect(second.code).toBe("PT-000002");
    expect(await rowOf(f.admin, a1)).toMatchObject({ paid: 2_000_000, remaining: 0, status: "paid" });
    await expect(svc.createReceipt(f.admin, receipt(a1, 1))).rejects.toMatchObject({ code: "CONFLICT" });

    // Tổng của lớp A: 2 học viên × 2.000.000, đã thu 2.000.000.
    const classA = await svc.listTuition(f.admin, { classId: f.classA.id });
    expect(classA.total).toEqual({ due: 4_000_000, paid: 2_000_000, remaining: 2_000_000 });
    expect((await svc.listTuition(f.admin, { classId: f.classA.id, status: "unpaid" })).rows.map((r) => r.studentCode)).toEqual(["A2"]);
    expect((await svc.listTuition(f.admin, { q: "a1" })).rows.map((r) => r.studentCode)).toEqual(["A1"]);
  });

  it("giảm học phí riêng từng học viên; mức giảm không vượt học phí", async () => {
    await svc.setClassFee(f.admin, { classId: f.classA.id, tuitionFee: 2_000_000 });
    await expect(svc.setDiscount(f.admin, { enrollmentId: a1, discount: 2_000_001, reason: null })).rejects.toMatchObject({ code: "VALIDATION" });
    await svc.setDiscount(f.admin, { enrollmentId: a1, discount: 500_000, reason: "Anh chị em" });
    expect(await rowOf(f.admin, a1)).toMatchObject({ discount: 500_000, discountReason: "Anh chị em", due: 1_500_000, status: "unpaid" });
    expect((await rowOf(f.admin, a2)).due).toBe(2_000_000);
    await svc.createReceipt(f.admin, receipt(a1, 1_500_000));
    expect((await rowOf(f.admin, a1)).status).toBe("paid");
  });

  it("hủy phiếu thu chỉ Admin, phải có lý do; phiếu hủy không còn tính là đã đóng và vẫn được giữ lại", async () => {
    await svc.setClassFee(f.admin, { classId: f.classA.id, tuitionFee: 1_000_000 });
    const created = await svc.createReceipt(f.admin, receipt(a1, 1_000_000));
    const collector = withPerms(f.actorA, { tuition: FULL });
    await expect(svc.cancelReceipt(collector, { id: created.id, reason: "Nhầm" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await svc.cancelReceipt(f.admin, { id: created.id, reason: "Ghi nhầm học viên" });
    await expect(svc.cancelReceipt(f.admin, { id: created.id, reason: "Lần hai" })).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await rowOf(f.admin, a1)).toMatchObject({ paid: 0, status: "unpaid" });
    const list = await svc.listReceipts(f.admin, { classId: f.classA.id });
    expect(list).toMatchObject([{ code: "PT-000001", status: "cancelled", cancelReason: "Ghi nhầm học viên", studentCode: "A1" }]);
    const logs = await db.select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.tableName, "tuition_receipts"));
    expect(logs.map((l) => l.action).sort()).toEqual(["tuition_receipt_cancelled", "tuition_receipt_created"]);
  });

  it("Admin xóa được phiếu thu đã hủy; phiếu còn hiệu lực phải hủy trước; người khác không xóa được", async () => {
    await svc.setClassFee(f.admin, { classId: f.classA.id, tuitionFee: 1_000_000 });
    const wrong = await svc.createReceipt(f.admin, receipt(a1, 300_000));
    const kept = await svc.createReceipt(f.admin, receipt(a1, 200_000));
    // Phiếu còn hiệu lực: không xóa được.
    await expect(svc.deleteReceipt(f.admin, wrong.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await svc.cancelReceipt(f.admin, { id: wrong.id, reason: "Ghi nhầm" });
    await expect(svc.deleteReceipt(withPerms(f.actorA, { tuition: FULL }), wrong.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await svc.deleteReceipt(f.admin, wrong.id);
    await expect(svc.deleteReceipt(f.admin, wrong.id)).rejects.toMatchObject({ code: "NOT_FOUND" });

    // Chỉ còn phiếu hiệu lực; số đã đóng không đổi; số phiếu đã dùng không cấp lại.
    expect((await svc.listReceipts(f.admin)).map((r) => r.id)).toEqual([kept.id]);
    expect(await rowOf(f.admin, a1)).toMatchObject({ paid: 200_000, status: "partial" });
    expect((await svc.createReceipt(f.admin, receipt(a1, 100_000))).code).toBe("PT-000003");
    const [log] = await db.select().from(auditLogs).where(eq(auditLogs.action, "tuition_receipt_deleted"));
    expect(log!.oldValue).toMatchObject({ receiptNo: 1, amount: 300_000, cancelReason: "Ghi nhầm" });
  });

  it("quyền theo menu Học phí và phạm vi lớp: không có quyền thì bị từ chối, lớp khác coi như không tồn tại", async () => {
    await svc.setClassFee(f.admin, { classId: f.classA.id, tuitionFee: 1_000_000 });
    await svc.setClassFee(f.admin, { classId: f.classB.id, tuitionFee: 1_000_000 });
    // Giáo viên mặc định không có quyền Học phí.
    await expect(svc.listTuition(f.actorA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.createReceipt(f.actorA, receipt(a1, 1))).rejects.toMatchObject({ code: "FORBIDDEN" });

    const viewer = withPerms(f.actorA, { tuition: { view: true, add: false, edit: false } });
    expect((await svc.listTuition(viewer)).rows.map((r) => r.classCode)).toEqual(["A", "A"]);
    await expect(svc.createReceipt(viewer, receipt(a1, 1))).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(svc.setDiscount(viewer, { enrollmentId: a1, discount: 1, reason: null })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const collector = withPerms(f.actorA, { tuition: FULL });
    const created = await svc.createReceipt(collector, receipt(a1, 400_000));
    await expect(svc.createReceipt(collector, receipt(b1, 400_000))).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(svc.setClassFee(collector, { classId: f.classB.id, tuitionFee: 1 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await svc.getReceipt(collector, created.id)).receipt).toMatchObject({ amount: 400_000, studentName: "Học viên A1", classCode: "A" });
    const other = await svc.createReceipt(f.admin, receipt(b1, 100_000));
    await expect(svc.getReceipt(collector, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await svc.listReceipts(collector)).map((r) => r.classCode)).toEqual(["A"]);
  });

  it("giấy báo học phí: một em hoặc cả lớp, bỏ qua em đã đóng đủ khi chọn; không xóa được ghi danh đã có phiếu thu", async () => {
    await svc.setClassFee(f.admin, { classId: f.classA.id, tuitionFee: 1_000_000 });
    await svc.createReceipt(f.admin, receipt(a1, 1_000_000));
    await svc.updateCenterInfo(f.admin, { name: "HAXI STEM", address: "12 Đường A", phone: "0900000000", bank: "STK 123" });
    const all = await svc.getFeeNotices(f.admin, { classId: f.classA.id });
    expect(all.notices.map((n) => [n.studentCode, n.status])).toEqual([
      ["A1", "paid"],
      ["A2", "unpaid"],
    ]);
    expect(all.center).toEqual({ name: "HAXI STEM", address: "12 Đường A", phone: "0900000000", bank: "STK 123" });
    expect((await svc.getFeeNotices(f.admin, { classId: f.classA.id, unpaidOnly: true })).notices.map((n) => n.studentCode)).toEqual(["A2"]);
    expect((await svc.getFeeNotices(f.admin, { enrollmentId: a1 })).notices).toHaveLength(1);
    // Lớp B chưa đặt học phí: không có giấy báo.
    expect((await svc.getFeeNotices(f.admin, { classId: f.classB.id })).notices).toEqual([]);

    await expect(deleteEnrollment(f.admin, a1)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(svc.updateCenterInfo(f.actorA, { name: "X", address: null, phone: null, bank: null })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await db.select().from(tuitionReceipts)).toHaveLength(1);
  });
});
