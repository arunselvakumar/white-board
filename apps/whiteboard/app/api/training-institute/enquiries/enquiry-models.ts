import { z } from "zod";

import { TrainingInstituteTimingSlotModel } from "../batches/timing-slot-model";
import { TrainingInstituteDemoModel } from "../demos/demo-models";
import { TrainingInstituteEnquirySourceModel } from "../enquiry-sources/enquiry-source-models";

const ClassMode = z.enum(["offline", "online", "hybrid"]);
const Stage = z.enum([
  "new",
  "follow_up",
  "demo_scheduled",
  "demo_attended",
  "joined",
  "not_interested",
]);
const OptionalText = (max: number) => z.string().trim().max(max).nullish();

export const TrainingInstituteEnquiryParamsModel = z.object({ id: z.uuid() });

const enquiryInputFields = {
  prospectName: z.string().trim().min(1).max(200),
  phone: z.string().trim().min(1).max(32),
  email: z.string().trim().max(320).nullish(),
  guardianName: OptionalText(200),
  guardianPhone: z.string().trim().max(32).nullish(),
  courseId: z.uuid().nullish(),
  subject: OptionalText(200),
  preferredClassMode: ClassMode.nullish(),
  preferredTiming: OptionalText(200),
  sourceId: z.uuid().nullish(),
  notes: OptionalText(2000),
};

export const CreateTrainingInstituteEnquiryRequestModel = z.object({
  ...enquiryInputFields,
  nextFollowUpOn: z.iso.date().nullish(),
});

export const UpdateTrainingInstituteEnquiryDetailsRequestModel =
  z.object(enquiryInputFields);

export const LogTrainingInstituteEnquiryFollowUpRequestModel = z.object({
  note: z.string().trim().min(1).max(1000),
  nextFollowUpOn: z.iso.date().nullable(),
});

export const MarkTrainingInstituteEnquiryNotInterestedRequestModel = z.object({
  reason: z.string().trim().min(1).max(200),
});

export const ReopenTrainingInstituteEnquiryRequestModel = z.object({
  nextFollowUpOn: z.iso.date().nullish(),
});

export const ConvertTrainingInstituteEnquiryRequestModel = z.object({
  batchId: z.uuid(),
  timingSource: z.enum(["batch", "student"]),
  studentTimings: z.array(TrainingInstituteTimingSlotModel).optional(),
  classModeOverride: ClassMode.nullish(),
});

export const ListTrainingInstituteEnquiriesRequestModel = z
  .object({
    view: z.enum(["due", "open", "closed", "all"]).optional().default("open"),
    q: z.string().trim().max(200).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(20),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const TrainingInstituteEnquiryModel = z.object({
  id: z.uuid(),
  prospectName: z.string(),
  phone: z.string(),
  email: z.string().nullable(),
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  courseId: z.uuid().nullable(),
  courseName: z.string().nullable(),
  subject: z.string().nullable(),
  preferredClassMode: ClassMode.nullable(),
  preferredTiming: z.string().nullable(),
  source: TrainingInstituteEnquirySourceModel.nullable(),
  notes: z.string().nullable(),
  stage: Stage,
  nextFollowUpOn: z.iso.date().nullable(),
  /** Open, and the next follow-up date is today or earlier (Asia/Kolkata). */
  followUpDue: z.boolean(),
  notInterestedReason: z.string().nullable(),
  convertedStudentId: z.uuid().nullable(),
  convertedEnrollmentId: z.uuid().nullable(),
  convertedAt: z.iso.datetime().nullable(),
  createdByUserId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const TrainingInstituteEnquiryActivityModel = z.object({
  id: z.uuid(),
  kind: z.enum([
    "created",
    "follow_up",
    "not_interested",
    "reopened",
    "joined",
    "details_updated",
  ]),
  note: z.string().nullable(),
  nextFollowUpOn: z.iso.date().nullable(),
  createdByUserId: z.string(),
  createdAt: z.iso.datetime(),
});

export const TrainingInstituteEnquiryDetailModel =
  TrainingInstituteEnquiryModel.extend({
    /** Newest first. */
    history: z.array(TrainingInstituteEnquiryActivityModel),
    /** Ordered by date, then start time. Includes cancelled demos. */
    demos: z.array(TrainingInstituteDemoModel),
  });

export const ListTrainingInstituteEnquiriesResponseModel = z.object({
  items: z.array(TrainingInstituteEnquiryModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});

export const ConvertTrainingInstituteEnquiryResponseModel = z.object({
  enquiry: TrainingInstituteEnquiryModel,
  studentId: z.uuid(),
  enrollmentId: z.uuid(),
});

export const FindTrainingInstituteEnquiryPhoneMatchesRequestModel = z.object({
  phone: z.string().trim().min(1).max(32),
  excludeEnquiryId: z.uuid().nullish(),
});

export const FindTrainingInstituteEnquiryPhoneMatchesResponseModel = z.object({
  enquiries: z.array(
    z.object({ id: z.uuid(), prospectName: z.string(), stage: Stage }),
  ),
  students: z.array(z.object({ id: z.uuid(), name: z.string() })),
});

export const TrainingInstituteEnquiryOptionsResponseModel = z.object({
  courses: z.array(z.object({ id: z.uuid(), name: z.string() })),
  batches: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      courseId: z.uuid(),
      courseName: z.string(),
      classMode: ClassMode,
      timezone: z.string(),
      capacity: z.number().int(),
      enrolled: z.number().int(),
    }),
  ),
  teachers: z.array(z.object({ id: z.uuid(), name: z.string() })),
  /** Includes retired Sources; offer only active ones for new choices. */
  sources: z.array(TrainingInstituteEnquirySourceModel),
  /** The caller's own Teacher id when they are a Teacher, else null. */
  currentTeacherId: z.uuid().nullable(),
});

export const GetTrainingInstituteEnquirySummaryRequestModel = z.object({
  /** YYYY-MM, a calendar month in Asia/Kolkata. */
  month: z.string().min(1).max(7),
});

export const TrainingInstituteEnquirySummaryResponseModel = z.object({
  month: z.string(),
  enquiriesReceived: z.number().int(),
  demosAttended: z.number().int(),
  admissions: z.number().int(),
  paidDemoFeesPaise: z.number().int(),
  /** Top 5, most frequent first. */
  notInterestedReasons: z.array(
    z.object({ reason: z.string(), count: z.number().int() }),
  ),
  /** Most admissions first, then most Enquiries. `sourceId` null = no Source. */
  sources: z.array(
    z.object({
      sourceId: z.uuid().nullable(),
      name: z.string(),
      enquiries: z.number().int(),
      admissions: z.number().int(),
    }),
  ),
});
