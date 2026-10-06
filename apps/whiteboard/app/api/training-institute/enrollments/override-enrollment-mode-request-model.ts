import { z } from "zod";

export const OverrideTrainingInstituteEnrollmentModeRequestModel = z.object({
  classModeOverride: z.enum(["offline", "online", "hybrid"]).nullable(),
});
export type OverrideTrainingInstituteEnrollmentModeRequestModel = z.infer<
  typeof OverrideTrainingInstituteEnrollmentModeRequestModel
>;
