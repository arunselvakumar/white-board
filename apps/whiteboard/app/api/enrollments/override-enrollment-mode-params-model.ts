import { z } from "zod";

export const OverrideEnrollmentModeParamsModel = z.object({ id: z.uuid() });
export type OverrideEnrollmentModeParamsModel = z.infer<
  typeof OverrideEnrollmentModeParamsModel
>;
