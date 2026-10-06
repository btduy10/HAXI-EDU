"use server";

import { permissionConfigInput } from "@/lib/permissions";
import { idOnly } from "@/lib/validation/common";
import { approveInput, classIdOnly, giftInput, giftUpdate, handoverIdInput, settingsInput, tierInput } from "@/lib/validation/rewards";
import { runAction } from "../action";
import * as reports from "../services/reports";
import * as summaries from "../services/summaries";

const ADMIN = "/admin";

export const createGiftAction = async (input: unknown) => runAction(giftInput, input, summaries.createGift, ADMIN);
export const updateGiftAction = async (input: unknown) =>
  runAction(giftUpdate, input, (a, d) => summaries.updateGift(a, d.id, d.data), ADMIN);
export const deleteGiftAction = async (input: unknown) => runAction(idOnly, input, (a, d) => summaries.deleteGift(a, d.id), ADMIN);

export const createTierAction = async (input: unknown) => runAction(tierInput, input, summaries.createTier, ADMIN);
export const deleteTierAction = async (input: unknown) => runAction(idOnly, input, (a, d) => summaries.deleteTier(a, d.id), ADMIN);

// Đóng lớp làm đổi cả trang của GV (lớp chuyển sang "Đã đóng") nên làm mới toàn bộ.
export const closeClassAction = async (input: unknown) => runAction(classIdOnly, input, (a, d) => summaries.closeClass(a, d.classId), "/");
export const approveRewardsAction = async (input: unknown) =>
  runAction(approveInput, input, (a, d) => summaries.approveRewards(a, d.classId, d.summaryIds), ADMIN);
export const markGiftGivenAction = async (input: unknown) =>
  runAction(handoverIdInput, input, (a, d) => summaries.markGiftGiven(a, d.handoverId), ADMIN);
export const cancelApprovalAction = async (input: unknown) =>
  runAction(handoverIdInput, input, (a, d) => summaries.cancelApproval(a, d.handoverId), ADMIN);

export const updateSettingsAction = async (input: unknown) => runAction(settingsInput, input, reports.updateSettings, ADMIN);
// Đổi quyền ảnh hưởng cả khu vực giảng dạy nên làm mới toàn bộ.
export const updatePermissionsAction = async (input: unknown) =>
  runAction(permissionConfigInput, input, reports.updatePermissions, "/");
