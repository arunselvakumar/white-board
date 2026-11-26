import { z } from "zod";

export const SetUpPreschoolRequestModel = z.object({
  /** 1–12; used only when the Preschool is set up for the first time. Defaults to April. */
  academicYearStartMonth: z.number().int().min(1).max(12).optional(),
});

export const SetUpPreschoolResponseModel = z.object({
  /** The first Centre. */
  centreId: z.uuid(),
  academicYearId: z.uuid(),
  /** False when the Workspace was already set up and nothing was written. */
  created: z.boolean(),
});
