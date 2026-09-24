import { z } from "zod";

import { TimingSlotModel } from "../batches/timing-slot-model";

export const CreateEnrollmentRequestModel = z.object({
  studentId: z.uuid(),
  batchId: z.uuid(),
  classModeOverride: z.enum(["offline", "online", "hybrid"]).nullable().optional(),
  timingSource: z.enum(["batch", "student"]).default("batch"),
  studentTimings: z.array(TimingSlotModel).optional(),
});

export type CreateEnrollmentRequestModel = z.infer<
  typeof CreateEnrollmentRequestModel
>;
