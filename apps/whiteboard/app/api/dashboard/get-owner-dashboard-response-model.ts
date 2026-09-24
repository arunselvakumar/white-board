import { z } from "zod";

import { TimingSlotModel } from "../batches/timing-slot-model";

export const GetOwnerDashboardResponseModel = z.object({
  activeStudentCount: z.number().int(),
  outstandingDuesPaise: z.number().int(),
  todayBatches: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      courseId: z.uuid(),
      classMode: z.enum(["offline", "online", "hybrid"]),
      capacity: z.number().int(),
      enrolledCount: z.number().int(),
      timings: z.array(TimingSlotModel),
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
export type GetOwnerDashboardResponseModel = z.infer<
  typeof GetOwnerDashboardResponseModel
>;
