import { z } from "zod";

export const AdjustTrainingInstituteFeePlanParamsModel = z.object({
  id: z.uuid(),
});
export type AdjustTrainingInstituteFeePlanParamsModel = z.infer<
  typeof AdjustTrainingInstituteFeePlanParamsModel
>;
