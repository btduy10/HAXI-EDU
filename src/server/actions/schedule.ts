"use server";

import { idOnly } from "@/lib/validation/common";
import {
  attendanceInput,
  classIdInput,
  makeupInput,
  sessionCancelInput,
  sessionEditInput,
  sessionIdInput,
  sessionRescheduleInput,
  sessionSubstituteInput,
  templateInput,
} from "@/lib/validation/schedule";
import { runAction } from "../action";
import * as attendance from "../services/attendance";
import * as sessions from "../services/sessions";

const ADMIN = "/admin";
const withClassId = (classId: unknown, input: unknown) => ({ ...(typeof input === "object" ? input : null), classId });

export const createTemplateAction = async (classId: unknown, input: unknown) =>
  runAction(templateInput, withClassId(classId, input), sessions.createTemplate, ADMIN);
export const deleteTemplateAction = async (input: unknown) =>
  runAction(idOnly, input, (a, d) => sessions.deleteTemplate(a, d.id), ADMIN);
export const generateSessionsAction = async (input: unknown) =>
  runAction(classIdInput, input, (a, d) => sessions.generateSessions(a, d.classId), ADMIN);

export const updateSessionAction = async (input: unknown) => runAction(sessionEditInput, input, sessions.updateSession, ADMIN);
export const rescheduleSessionAction = async (input: unknown) =>
  runAction(sessionRescheduleInput, input, sessions.rescheduleSession, ADMIN);
export const cancelSessionAction = async (input: unknown) => runAction(sessionCancelInput, input, sessions.cancelSession, ADMIN);
export const restoreSessionAction = async (input: unknown) =>
  runAction(idOnly, input, (a, d) => sessions.restoreSession(a, d.id), ADMIN);
export const setSubstituteAction = async (input: unknown) =>
  runAction(sessionSubstituteInput, input, sessions.setSubstitute, ADMIN);
export const createMakeupAction = async (input: unknown) => runAction(makeupInput, input, sessions.createMakeupSession, ADMIN);

// Dùng chung cho Admin và GV: service kiểm tra quyền trên từng buổi.
export const saveAttendanceAction = async (input: unknown) =>
  runAction(attendanceInput, input, (a, d) => attendance.saveAttendance(a, d), "/");
export const unlockAttendanceAction = async (input: unknown) =>
  runAction(sessionIdInput, input, (a, d) => attendance.unlockAttendance(a, d.sessionId), ADMIN);
