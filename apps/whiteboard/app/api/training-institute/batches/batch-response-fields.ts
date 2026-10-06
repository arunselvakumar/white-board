import { z } from "zod";

import { TrainingInstituteTimingSlotModel } from "./timing-slot-model";

export const batchResponseFields = {
  id: z.uuid(),
  courseId: z.uuid(),
  name: z.string(),
  classMode: z.enum(["offline", "online", "hybrid"]),
  capacity: z.number().int(),
  room: z.string().nullable(),
  joinUrl: z.string().nullable(),
  meetingOption: z.enum(["external", "whiteboard"]),
  timings: z.array(TrainingInstituteTimingSlotModel),
  timezone: z.string(),
  closedAt: z.iso.datetime().nullable(),
  enrolledCount: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdByUserId: z.string(),
};
