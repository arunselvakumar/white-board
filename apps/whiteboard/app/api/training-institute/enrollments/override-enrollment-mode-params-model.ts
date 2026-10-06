import { z } from "zod";

export const OverrideTrainingInstituteEnrollmentModeParamsModel = z.object({
  id: z.uuid(),
});
export type OverrideTrainingInstituteEnrollmentModeParamsModel = z.infer<
  typeof OverrideTrainingInstituteEnrollmentModeParamsModel
>;
