import { z } from "zod";

const Channel = z.enum(["phone", "whatsapp_sms", "in_person", "other"]);
const CloseReason = z.enum(["superseded", "done", "dues_cleared"]);
const DueDate = z.object({
  dueOn: z.iso.date(),
  amountPaise: z.number().int(),
});

export const ListTrainingInstituteFeeDuesRequestModel = z.object({
  filter: z.enum(["overdue", "due_soon", "all"]).optional().default("all"),
  sort: z.enum(["amount", "due_date"]).optional().default("amount"),
});

export const TrainingInstituteFeeDueModel = z.object({
  enrollmentId: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  courseId: z.uuid(),
  courseName: z.string(),
  batchId: z.uuid(),
  batchName: z.string(),
  /** Ended Enrollments still appear while money is owed. */
  enrollmentEnded: z.boolean(),
  remainingPaise: z.number().int(),
  overduePaise: z.number().int(),
  overdue: z.boolean(),
  dueSoon: z.boolean(),
  /** "unclear" when the due-date amounts don't add up to the Fee Plan. */
  dueDatesClarity: z.enum(["clear", "unclear"]),
  oldestUnpaidDueOn: z.iso.date().nullable(),
  nextUnpaidDueOn: z.iso.date().nullable(),
  dueDates: z.array(DueDate),
  openFollowUp: z
    .object({
      id: z.uuid(),
      channel: Channel,
      nextFollowUpOn: z.iso.date().nullable(),
    })
    .nullable(),
});

export const ListTrainingInstituteFeeDuesResponseModel = z.object({
  filter: z.enum(["overdue", "due_soon", "all"]),
  sort: z.enum(["amount", "due_date"]),
  items: z.array(TrainingInstituteFeeDueModel),
  counts: z.object({
    overdue: z.number().int(),
    dueSoon: z.number().int(),
    all: z.number().int(),
  }),
  totalRemainingPaise: z.number().int(),
});

export const TrainingInstituteFeeFollowUpDueModel = z.object({
  id: z.uuid(),
  enrollmentId: z.uuid(),
  studentId: z.uuid(),
  studentName: z.string(),
  courseName: z.string(),
  batchName: z.string(),
  remainingPaise: z.number().int(),
  channel: Channel,
  note: z.string().nullable(),
  nextFollowUpOn: z.iso.date(),
  /** 0 when due today. */
  daysOverdue: z.number().int(),
});

export const ListTrainingInstituteFeeFollowUpsDueResponseModel = z.object({
  items: z.array(TrainingInstituteFeeFollowUpDueModel),
});

const UserName = z.object({ userId: z.string(), name: z.string() });

export const TrainingInstituteFeeFollowUpModel = z.object({
  id: z.uuid(),
  enrollmentId: z.uuid(),
  channel: Channel,
  note: z.string().nullable(),
  nextFollowUpOn: z.iso.date().nullable(),
  open: z.boolean(),
  loggedAt: z.iso.datetime(),
  loggedBy: UserName,
  editedAt: z.iso.datetime().nullable(),
  editedBy: UserName.nullable(),
  closedAt: z.iso.datetime().nullable(),
  closeReason: CloseReason.nullable(),
});

export const ListTrainingInstituteFeeFollowUpsResponseModel = z.object({
  enrollmentId: z.uuid(),
  remainingPaise: z.number().int(),
  items: z.array(TrainingInstituteFeeFollowUpModel),
});

export const TrainingInstituteFeeFollowUpParamsModel = z.object({
  id: z.uuid(),
});

export const TrainingInstituteFeeFollowUpEnrollmentParamsModel = z.object({
  id: z.uuid(),
});

const followUpInputFields = {
  channel: Channel,
  note: z.string().trim().max(500).nullish(),
  nextFollowUpOn: z.iso.date().nullish(),
};

export const LogTrainingInstituteFeeFollowUpRequestModel =
  z.object(followUpInputFields);

export const EditTrainingInstituteFeeFollowUpRequestModel =
  z.object(followUpInputFields);

export type IdContext = { params: Promise<{ id: string }> };
