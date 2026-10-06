import { z } from "zod";

import { TrainingInstituteFeePlanDueDateModel } from "./due-date-model";

export const AdjustTrainingInstituteFeePlanRequestModel = z.object({
  type: z.enum(["one_time", "monthly", "installments"]),
  amountPaise: z.number().int().min(0),
  concessionPaise: z.number().int().min(0).default(0),
  installmentCount: z.number().int().min(2).nullable().optional(),
  dueDates: z.array(TrainingInstituteFeePlanDueDateModel).min(1),
});
export type AdjustTrainingInstituteFeePlanRequestModel = z.infer<
  typeof AdjustTrainingInstituteFeePlanRequestModel
>;
