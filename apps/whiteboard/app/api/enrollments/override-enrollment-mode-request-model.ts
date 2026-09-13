import { z } from "zod";

export const OverrideEnrollmentModeRequestModel = z.object({
  classModeOverride: z.enum(["offline", "online", "hybrid"]).nullable(),
});
export type OverrideEnrollmentModeRequestModel = z.infer<
  typeof OverrideEnrollmentModeRequestModel
>;
