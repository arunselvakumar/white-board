import { z } from "zod";

import { TrainingInstituteTimingSlotModel } from "../batches/timing-slot-model";

import { TrainingInstituteFeePlanDueDateModel } from "./due-date-model";

export const enrollmentResponseFields = {
  id: z.uuid(),
  studentId: z.uuid(),
  courseId: z.uuid(),
  batchId: z.uuid(),
  classModeOverride: z.enum(["offline", "online", "hybrid"]).nullable(),
  timingSource: z.enum(["batch", "student"]),
  studentTimings: z.array(TrainingInstituteTimingSlotModel).nullable(),
  endedAt: z.iso.datetime().nullable(),
  feePlanType: z.enum(["one_time", "monthly", "installments"]),
  feePlanAmountPaise: z.number().int(),
  feePlanConcessionPaise: z.number().int(),
  feePlanInstallmentCount: z.number().int().nullable(),
  feePlanDueDates: z.array(TrainingInstituteFeePlanDueDateModel),
  remainingDuesPaise: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdByUserId: z.string(),
};
