import { z } from "zod";

import { TimingSlotModel } from "../batches/timing-slot-model";

export const SetEnrollmentTimingsRequestModel = z.object({
  timingSource: z.enum(["batch", "student"]),
  studentTimings: z.array(TimingSlotModel).optional(),
});
export type SetEnrollmentTimingsRequestModel = z.infer<
  typeof SetEnrollmentTimingsRequestModel
>;
