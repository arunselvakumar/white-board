import { z } from "zod";

const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const FeeKind = z.enum(["free", "paid"]);
// Range rules live in the domain so they answer DEMO_FEE_INVALID.
const FeeAmount = z.number().int().nullish();

export const TrainingInstituteDemoParamsModel = z.object({ id: z.uuid() });

export const TrainingInstituteDemoModel = z.object({
  id: z.uuid(),
  enquiryId: z.uuid(),
  prospectName: z.string(),
  /** The Course name, else the free-text subject, of the Enquiry. */
  enquiryInterest: z.string().nullable(),
  kind: z.enum(["batch", "one_to_one"]),
  batchId: z.uuid().nullable(),
  batchName: z.string().nullable(),
  /** The Batch's Course for a Batch demo; null for one-to-one. */
  courseName: z.string().nullable(),
  teacherId: z.uuid().nullable(),
  teacherName: z.string().nullable(),
  date: z.iso.date(),
  startTime: Clock,
  endTime: Clock,
  timezone: z.string(),
  feeKind: FeeKind,
  feeAmountPaise: z.number().int().nullable(),
  feePaidAt: z.iso.datetime().nullable(),
  attendance: z.enum(["unmarked", "attended", "missed"]),
  attendanceMarkedAt: z.iso.datetime().nullable(),
  cancelledAt: z.iso.datetime().nullable(),
  createdByUserId: z.string(),
  createdAt: z.iso.datetime(),
});

export const BookTrainingInstituteDemoRequestModel = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal("batch"),
      batchId: z.uuid(),
      date: z.iso.date(),
      startTime: Clock,
      feeKind: FeeKind,
      feeAmountPaise: FeeAmount,
    }),
    z.object({
      kind: z.literal("one_to_one"),
      teacherId: z.uuid(),
      date: z.iso.date(),
      startTime: Clock,
      endTime: Clock,
      feeKind: FeeKind,
      feeAmountPaise: FeeAmount,
    }),
  ],
);

export const ListTrainingInstituteDemosRequestModel = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
});

export const ListTrainingInstituteDemosResponseModel = z.object({
  items: z.array(TrainingInstituteDemoModel),
});

export const ListTrainingInstituteDemoSlotsRequestModel = z.object({
  batchId: z.uuid(),
  date: z.iso.date(),
});

export const ListTrainingInstituteDemoSlotsResponseModel = z.object({
  items: z.array(
    z.object({
      date: z.iso.date(),
      startTime: Clock,
      endTime: Clock,
      status: z.enum(["scheduled", "cancelled", "moved", "holiday"]),
      rescheduled: z.boolean(),
      reason: z.string().nullable(),
      /** Scheduled, and its start time hasn't passed. */
      bookable: z.boolean(),
    }),
  ),
});

export const MarkTrainingInstituteDemoAttendanceRequestModel = z.object({
  attended: z.boolean(),
});
