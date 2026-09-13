import { z } from "zod";

import { TimingSlotModel } from "../batches/timing-slot-model";

import { FeePlanDueDateModel } from "./due-date-model";

export const enrollmentResponseFields = {
  id: z.uuid(),
  studentId: z.uuid(),
  courseId: z.uuid(),
  batchId: z.uuid(),
  classModeOverride: z.enum(["offline", "online", "hybrid"]).nullable(),
  timingSource: z.enum(["batch", "student"]),
  studentTimings: z.array(TimingSlotModel).nullable(),
  endedAt: z.iso.datetime().nullable(),
  feePlanType: z.enum(["one_time", "monthly", "installments"]),
  feePlanAmountPaise: z.number().int(),
  feePlanConcessionPaise: z.number().int(),
  feePlanInstallmentCount: z.number().int().nullable(),
  feePlanDueDates: z.array(FeePlanDueDateModel),
  remainingDuesPaise: z.number().int(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  createdByUserId: z.string(),
};
