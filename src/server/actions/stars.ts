"use server";

import { idOnly } from "@/lib/validation/common";
import {
  avatarUpdate,
  awardInput,
  criteriaInput,
  criteriaUpdate,
  deleteStarLogsInput,
  giftAvatarInput,
  levelInput,
  levelUpdate,
  setAvatarInput,
  undoInput,
} from "@/lib/validation/stars";
import { runAction } from "../action";
import * as avatars from "../services/avatars";
import * as stars from "../services/stars";

const ADMIN = "/admin";
const ALL = "/";

export const createCriteriaAction = async (input: unknown) => runAction(criteriaInput, input, stars.createCriteria, ADMIN);
export const updateCriteriaAction = async (input: unknown) =>
  runAction(criteriaUpdate, input, (a, d) => stars.updateCriteria(a, d.id, d.data), ADMIN);
export const deleteCriteriaAction = async (input: unknown) =>
  runAction(idOnly, input, (a, d) => stars.deleteCriteria(a, d.id), ADMIN);

export const createLevelAction = async (input: unknown) => runAction(levelInput, input, stars.createLevel, ADMIN);
export const updateLevelAction = async (input: unknown) =>
  runAction(levelUpdate, input, (a, d) => stars.updateLevel(a, d.id, d.data), ADMIN);
export const deleteLevelAction = async (input: unknown) => runAction(idOnly, input, (a, d) => stars.deleteLevel(a, d.id), ADMIN);

// id avatar được gắn sẵn bằng .bind() ở trang; vẫn đi qua Zod và kiểm tra quyền.
export const updateAvatarAction = async (id: unknown, input: unknown) =>
  runAction(avatarUpdate, { id, data: input }, (a, d) => avatars.updateAvatar(a, d.id, d.data), ADMIN);
export const giftAvatarAction = async (input: unknown) =>
  runAction(giftAvatarInput, input, (a, d) => avatars.giftAvatar(a, d.studentId, d.avatarId), ADMIN);

// Dùng chung cho Admin và GV: service kiểm tra quyền trên buổi học / học viên.
export const awardStarsAction = async (input: unknown) => runAction(awardInput, input, (a, d) => stars.awardStars(a, d), ALL);
export const undoStarAction = async (input: unknown) => runAction(undoInput, input, (a, d) => stars.undoStarLog(a, d.logId), ALL);
export const setStudentAvatarAction = async (input: unknown) =>
  runAction(setAvatarInput, input, (a, d) => avatars.setStudentAvatar(a, d.studentId, d.avatarId), ALL);
export const deleteStarLogsAction = async (input: unknown) => runAction(deleteStarLogsInput, input, stars.deleteStudentStarLogs, ALL);
