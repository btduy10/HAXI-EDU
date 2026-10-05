import { z } from "zod";
import { id, intIn, optId, optText, reqText } from "./common";

export const criteriaInput = z
  .object({
    name: reqText(100),
    stars: intIn(-20, 20),
    active: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .default(true)
      .transform((v) => v === true || v === "true"),
  })
  .refine((v) => v.stars !== 0, { path: ["stars"], message: "Số sao phải khác 0 (âm = trừ sao)" })
  .transform((v) => ({ ...v, type: v.stars > 0 ? ("reward" as const) : ("penalty" as const) }));

export const criteriaUpdate = z.object({ id, data: criteriaInput });

export const levelInput = z.object({
  levelNo: intIn(1, 20),
  name: reqText(50),
  minStars: intIn(0, 100000),
  frameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Màu dạng #RRGGBB"),
});
export const levelUpdate = z.object({ id, data: levelInput });

export const avatarUpdate = z.object({
  id,
  data: z.object({
    name: reqText(50),
    requiredLevelId: optId.optional().transform((v) => v ?? null),
    active: z
      .union([z.boolean(), z.enum(["true", "false"])])
      .transform((v) => v === true || v === "true"),
  }),
});

export const awardInput = z.object({
  sessionId: id,
  criteriaId: id,
  studentIds: z.array(id).min(1, "Chọn ít nhất một học viên").max(300),
  note: optText(200),
});

export const undoInput = z.object({ logId: id });
export const setAvatarInput = z.object({ studentId: id, avatarId: id });
export const giftAvatarInput = z.object({ studentId: id, avatarId: id });
