import { z } from "zod";

import { TimingSlotModel } from "./timing-slot-model";

export const CreateBatchRequestModel = z.object({
  courseId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  classMode: z.enum(["offline", "online", "hybrid"]),
  capacity: z.number().int().min(1),
  room: z.string().trim().max(80).nullish(),
  joinUrl: z.string().trim().max(2048).nullish(),
  timings: z.array(TimingSlotModel).min(1),
});

export type CreateBatchRequestModel = z.infer<typeof CreateBatchRequestModel>;
