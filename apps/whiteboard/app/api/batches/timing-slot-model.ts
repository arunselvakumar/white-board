import { z } from "zod";

export const TimingSlotModel = z.object({
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
});
