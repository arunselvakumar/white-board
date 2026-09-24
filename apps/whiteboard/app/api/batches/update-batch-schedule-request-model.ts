import { z } from "zod";

import { TimingSlotModel } from "./timing-slot-model";

export const UpdateBatchScheduleRequestModel = z.object({
  name: z.string().trim().min(1).max(200),
  classMode: z.enum(["offline", "online", "hybrid"]),
  capacity: z.number().int().min(1),
  room: z.string().trim().max(80).nullable().optional(),
  joinUrl: z.string().trim().max(2048).nullable().optional(),
  timings: z.array(TimingSlotModel).min(1),
});

export type UpdateBatchScheduleRequestModel = z.infer<
  typeof UpdateBatchScheduleRequestModel
>;
