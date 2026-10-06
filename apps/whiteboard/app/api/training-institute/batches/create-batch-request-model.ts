import { z } from "zod";

import { TrainingInstituteTimingSlotModel } from "./timing-slot-model";
import { TrainingInstituteJoinUrlModel } from "./join-url-model";

export const CreateTrainingInstituteBatchRequestModel = z.object({
  courseId: z.uuid(),
  name: z.string().trim().min(1).max(200),
  classMode: z.enum(["offline", "online", "hybrid"]),
  capacity: z.number().int().min(1),
  room: z.string().trim().max(80).nullish(),
  joinUrl: TrainingInstituteJoinUrlModel.nullish(),
  meetingOption: z.enum(["external", "whiteboard"]).optional(),
  timings: z.array(TrainingInstituteTimingSlotModel).min(1),
});

export type CreateTrainingInstituteBatchRequestModel = z.infer<
  typeof CreateTrainingInstituteBatchRequestModel
>;
