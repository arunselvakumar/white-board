import { z } from "zod";

import { TrainingInstituteTimingSlotModel } from "../batches/timing-slot-model";

export const SetTrainingInstituteEnrollmentTimingsRequestModel = z.object({
  timingSource: z.enum(["batch", "student"]),
  studentTimings: z.array(TrainingInstituteTimingSlotModel).optional(),
});
export type SetTrainingInstituteEnrollmentTimingsRequestModel = z.infer<
  typeof SetTrainingInstituteEnrollmentTimingsRequestModel
>;
