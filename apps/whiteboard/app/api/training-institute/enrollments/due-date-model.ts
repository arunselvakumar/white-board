import { z } from "zod";

export const TrainingInstituteFeePlanDueDateModel = z.object({
  dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amountPaise: z.number().int().min(0),
});
