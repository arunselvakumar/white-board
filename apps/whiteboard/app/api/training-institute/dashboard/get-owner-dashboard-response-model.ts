import { z } from "zod";

import { TrainingInstituteTimingSlotModel } from "../batches/timing-slot-model";

export const GetTrainingInstituteOwnerDashboardResponseModel = z.object({
  activeStudentCount: z.number().int(),
  outstandingDuesPaise: z.number().int(),
  /** Open Fee Follow-ups whose next date is today or earlier. */
  feeFollowUpsDueCount: z.number().int(),
  todayBatches: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      courseId: z.uuid(),
      classMode: z.enum(["offline", "online", "hybrid"]),
      capacity: z.number().int(),
      enrolledCount: z.number().int(),
      timings: z.array(TrainingInstituteTimingSlotModel),
      todayClasses: z.array(
        z.object({
          startTime: z.string(),
          endTime: z.string(),
          rescheduled: z.boolean(),
        }),
      ),
    }),
  ),
  recentStudents: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      phone: z.string(),
      createdAt: z.iso.datetime(),
    }),
  ),
});
export type GetTrainingInstituteOwnerDashboardResponseModel = z.infer<
  typeof GetTrainingInstituteOwnerDashboardResponseModel
>;
