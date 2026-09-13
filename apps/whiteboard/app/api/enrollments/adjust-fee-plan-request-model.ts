import { z } from "zod";

import { FeePlanDueDateModel } from "./due-date-model";

export const AdjustFeePlanRequestModel = z.object({
  type: z.enum(["one_time", "monthly", "installments"]),
  amountPaise: z.number().int().min(0),
  concessionPaise: z.number().int().min(0).default(0),
  installmentCount: z.number().int().min(2).nullable().optional(),
  dueDates: z.array(FeePlanDueDateModel).min(1),
});
export type AdjustFeePlanRequestModel = z.infer<
  typeof AdjustFeePlanRequestModel
>;
