import { z } from "zod";

import { TrainingInstituteTimingSlotModel } from "../batches/timing-slot-model";

export const CreateTrainingInstituteEnrollmentRequestModel = z.object({
  studentId: z.uuid(),
  batchId: z.uuid(),
  classModeOverride: z
    .enum(["offline", "online", "hybrid"])
    .nullable()
    .optional(),
  timingSource: z.enum(["batch", "student"]).default("batch"),
  studentTimings: z.array(TrainingInstituteTimingSlotModel).optional(),
});

export type CreateTrainingInstituteEnrollmentRequestModel = z.infer<
  typeof CreateTrainingInstituteEnrollmentRequestModel
>;
