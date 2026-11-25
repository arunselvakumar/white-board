import { z } from "zod";

const Status = z.enum([
  "new",
  "contacted",
  "visit_scheduled",
  "visited",
  "admitted",
  "lost",
]);
const MovableStatus = z.enum(["contacted", "visit_scheduled", "visited"]);
const Source = z.enum([
  "walk_in",
  "referral",
  "google",
  "social_media",
  "flyer",
  "head_office",
  "other",
]);
const Gender = z.enum(["girl", "boy", "other"]);
const OptionalText = (max: number) => z.string().trim().max(max).nullish();

export const PreschoolEnquiryParamsModel = z.object({ id: z.uuid() });

const enquiryInputFields = {
  childName: z.string().trim().min(1).max(200),
  childDateOfBirth: z.iso.date().nullish(),
  childGender: Gender.nullish(),
  parentName: z.string().trim().min(1).max(200),
  parentPhone: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .describe("Indian mobile: 10 digits, optionally +91 or 0 first."),
  parentEmail: z.email().max(320).nullish(),
  programmeId: z.uuid().nullish(),
  source: Source,
  notes: OptionalText(2000),
};

export const CreatePreschoolEnquiryRequestModel = z.object({
  centreId: z.uuid(),
  ...enquiryInputFields,
  nextFollowUpOn: z.iso.date().nullish(),
});

export const UpdatePreschoolEnquiryDetailsRequestModel =
  z.object(enquiryInputFields);

export const LogPreschoolEnquiryFollowUpRequestModel = z.object({
  kind: z.enum(["note", "call", "visit"]),
  note: z.string().trim().min(1).max(2000),
  nextFollowUpOn: z.iso
    .date()
    .nullable()
    .optional()
    .describe("Leave out to keep the date; null clears it."),
  status: MovableStatus.optional(),
  visitOn: z.iso.date().nullish(),
});

export const MovePreschoolEnquiryRequestModel = z.object({
  status: MovableStatus,
  visitOn: z.iso.date().nullish().describe("Required for visit_scheduled."),
  note: OptionalText(2000),
  nextFollowUpOn: z.iso.date().nullable().optional(),
});

export const MarkPreschoolEnquiryLostRequestModel = z.object({
  reason: z.string().trim().min(1).max(200),
});

export const ReopenPreschoolEnquiryRequestModel = z.object({
  nextFollowUpOn: z.iso.date().nullish(),
  note: OptionalText(2000),
});

export const ListPreschoolEnquiriesRequestModel = z.object({
  centreId: z.uuid(),
  status: Status.optional(),
  view: z.enum(["open", "due", "closed", "all"]).optional().default("all"),
  q: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(25),
  cursor: z.string().min(1).optional(),
});

export const PreschoolEnquirySummaryRequestModel = z.object({
  centreId: z.uuid(),
});

export const PreschoolEnquiryPhoneMatchesRequestModel = z.object({
  centreId: z.uuid(),
  phone: z.string().trim().min(1).max(32),
  excludeEnquiryId: z.uuid().optional(),
});

export const PreschoolEnquiryModel = z.object({
  id: z.uuid(),
  centreId: z.uuid(),
  childName: z.string(),
  childDateOfBirth: z.iso.date().nullable(),
  childAgeText: z.string().nullable(),
  childGender: Gender.nullable(),
  parentName: z.string(),
  parentPhone: z.string(),
  parentEmail: z.string().nullable(),
  programmeId: z.uuid().nullable(),
  programmeName: z.string().nullable(),
  source: Source,
  status: Status,
  visitOn: z.iso.date().nullable(),
  nextFollowUpOn: z.iso.date().nullable(),
  followUpDue: z.boolean(),
  lostReason: z.string().nullable(),
  notes: z.string().nullable(),
  convertedChildId: z.uuid().nullable(),
  convertedAt: z.iso.datetime().nullable(),
  createdByUserId: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const PreschoolEnquiryActivityModel = z.object({
  id: z.uuid(),
  kind: z.enum(["note", "call", "visit", "status_change"]),
  note: z.string().nullable(),
  toStatus: Status.nullable(),
  createdByUserId: z.string(),
  createdByName: z.string(),
  createdAt: z.iso.datetime(),
});

export const PreschoolEnquiryDetailModel = PreschoolEnquiryModel.extend({
  activities: z.array(PreschoolEnquiryActivityModel),
});

export const ListPreschoolEnquiriesResponseModel = z.object({
  items: z.array(PreschoolEnquiryModel),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
});

export const PreschoolEnquirySummaryResponseModel = z.object({
  centreId: z.uuid(),
  byStatus: z.record(Status, z.number().int()),
  open: z.number().int(),
  followUpsDue: z.number().int(),
});

export const PreschoolEnquiryPhoneMatchesResponseModel = z.object({
  enquiries: z.array(
    z.object({
      id: z.uuid(),
      childName: z.string(),
      parentName: z.string(),
      status: Status,
      createdAt: z.iso.datetime(),
    }),
  ),
  children: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      admissionNumber: z.string(),
      status: z.enum(["active", "withdrawn", "graduated"]),
    }),
  ),
});
