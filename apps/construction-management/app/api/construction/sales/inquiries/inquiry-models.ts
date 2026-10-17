import { z } from "zod";

import type {
  InquiryActions,
  InquiryFormOptions,
  InquiryHistoryItem,
  InquiryReadModel,
  InquiryWriteInput,
} from "@/src/sales/application/inquiry-handlers";
import {
  FOLLOW_UP_DUES,
  INQUIRY_EVENT_TYPES,
  INQUIRY_STATUSES,
  INTEREST_TYPES,
  SALES_LIMITS,
} from "@/src/sales/domain/sales-terms";

export const INQUIRIES_PATH = "/api/construction/sales/inquiries";

const interestType = z.enum(INTEREST_TYPES);
const status = z.enum(INQUIRY_STATUSES);
const due = z.enum(FOLLOW_UP_DUES);
const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .describe("`HH:MM` in the Company's time zone.");

/** "a,b,c" → ["a", "b", "c"]. */
const commaSeparated = z
  .string()
  .min(1)
  .max(200)
  .transform((value) =>
    value
      .split(",")
      .map((part) => part.trim())
      .filter((part) => part !== ""),
  );

const optionalText = (max: number) => z.string().max(max).nullable().optional();

const InquiryBody = z.object({
  /**
   * `YYYY-MM-DD`; not in the future; back-dated window `inquiry`. Create:
   * today when left out. Edit: left out keeps it.
   */
  inquiryDate: z.iso.date().nullable().optional(),
  /** Required, at most 120 characters. */
  name: z.string().max(SALES_LIMITS.name * 2),
  /**
   * Optional. Ten digits become `+91…`; any other number must be `+` and
   * 8–15 digits (400 `INQUIRY_MOBILE_INVALID`).
   */
  mobile: optionalText(40),
  /** Optional; a valid address (400 `INQUIRY_EMAIL_INVALID`). */
  email: optionalText(254),
  address: optionalText(SALES_LIMITS.address * 2),
  occupation: optionalText(SALES_LIMITS.occupation * 2),
  interestType: interestType.nullable().optional(),
  /** "Interested In": a live Wing of the Project … */
  interestedWingId: z.uuid().nullable().optional(),
  /** … and/or a unit type in words, e.g. "2BHK" (≤ 60). */
  interestedUnitType: optionalText(SALES_LIMITS.unitType * 2),
  /** An enabled Lead Source of the Project (an unchanged disabled one may stay). */
  leadSourceId: z.uuid().nullable().optional(),
  /**
   * A live Funnel Stage of the Project. Create: the first stage when left
   * out. Edit: left out or null keeps it; it moves only while Open.
   */
  funnelStageId: z.uuid().nullable().optional(),
  /** The next follow-up's date; with `nextFollowUpTime` or for the whole day. */
  nextFollowUpDate: z.iso.date().nullable().optional(),
  nextFollowUpTime: time.nullable().optional(),
  /**
   * A Team Member on the Project. Create: the creator (when on the
   * Project) when left out. Edit: left out keeps it; null clears it.
   */
  assigneeMemberId: z.uuid().nullable().optional(),
  /** As `assigneeMemberId`. */
  leadOwnerMemberId: z.uuid().nullable().optional(),
  remarks: optionalText(SALES_LIMITS.remarks * 2),
  /**
   * **Save anyway**: skip the duplicate check (409 `INQUIRY_DUPLICATE`
   * lists the live inquiries with the same mobile or email).
   */
  allowDuplicate: z.boolean().optional().default(false),
});

export const CreateConstructionSalesInquiryRequestModel = InquiryBody.extend({
  projectId: z.uuid(),
});

export const UpdateConstructionSalesInquiryRequestModel = InquiryBody.extend({
  /** The inquiry's `updatedAt` as last seen; 409 `INQUIRY_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const DeleteConstructionSalesInquiryRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ConstructionSalesInquiryParamsModel = z.object({ id: z.uuid() });

/** Close as Converted (CM-1007). */
export const ConvertConstructionSalesInquiryRequestModel = z.object({
  /** A bookable unit of the Project (not Unavailable, no active booking). */
  unitId: z.uuid(),
  /** Today when left out; not in the future; back-dated window `booking`. */
  bookingDate: z.iso.date().nullable().optional(),
  expectedUpdatedAt: z.iso.datetime(),
});

/** Close as Lost (CM-1007). */
export const LoseConstructionSalesInquiryRequestModel = z.object({
  /** An enabled Lost Reason of the Project. */
  lostReasonId: z.uuid(),
  remarks: z
    .string()
    .max(SALES_LIMITS.remarks * 2)
    .nullable()
    .optional(),
  expectedUpdatedAt: z.iso.datetime(),
});

export const GetConstructionSalesInquiryImportSampleRequestModel = z.object({
  projectId: z.uuid(),
});

export const ImportConstructionSalesInquiriesRequestModel = z.object({
  projectId: z.uuid(),
  /** **Import duplicates too**: `true` lets a duplicate mobile or email in. */
  allowDuplicates: z.enum(["true", "false"]).optional(),
});

export const ImportConstructionSalesInquiriesResponseModel = z.object({
  imported: z.int(),
});

/** Reopen (CM-1007). */
export const ReopenConstructionSalesInquiryRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const GetConstructionSalesInquiryFormOptionsRequestModel = z.object({
  projectId: z.uuid(),
});

export const ListConstructionSalesInquiriesRequestModel = z
  .object({
    projectId: z.uuid(),
    /** Comma-separated: `open,lost`. */
    status: commaSeparated.pipe(z.array(status).min(1).max(3)).optional(),
    funnelStageId: z.uuid().optional(),
    /** Comma-separated: `hot,warm`. */
    interestType: commaSeparated
      .pipe(z.array(interestType).min(1).max(3))
      .optional(),
    leadSourceId: z.uuid().optional(),
    /** A Team Member id. */
    assigneeMemberId: z.uuid().optional(),
    /**
     * Open inquiries by their next follow-up: `overdue` (before now; a date
     * without a time before today), `today`, `upcoming`, `none`.
     */
    due: due.optional(),
    /** Part of the name, mobile or email. */
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(25),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });
const named = z.object({ id: z.uuid(), name: z.string().nullable() });

export const ConstructionSalesDateTimeResponseModel = z.object({
  date: z.iso.date(),
  /** `HH:MM`, or null for the whole day. */
  time: z.string().nullable(),
});

export const ConstructionSalesInquiryActionsResponseModel = z.object({
  /** Inquiry Update. */
  edit: z.boolean(),
  /** Inquiry Delete. */
  delete: z.boolean(),
  /** Add a follow-up: Update, while Open. */
  followUp: z.boolean(),
  /** Inquiry Tasks: Update. */
  manageTasks: z.boolean(),
  /** Close as Lost: Update, while Open. */
  close: z.boolean(),
  /** Close as Converted: Update and Booking Create, while Open. */
  convert: z.boolean(),
  /** Reopen: Update, while Converted or Lost. */
  reopen: z.boolean(),
});

export const ConstructionSalesInquiryResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  inquiryDate: z.iso.date(),
  name: z.string(),
  /** Normalised: `+91…` or `+` and 8–15 digits. */
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable(),
  occupation: z.string().nullable(),
  interestType: interestType.nullable(),
  interestedWing: named.nullable(),
  interestedUnitType: z.string().nullable(),
  leadSource: named.nullable(),
  /** The stage while Open; kept as it was once closed (a deleted one keeps its name). */
  funnelStage: named.nullable(),
  status,
  nextFollowUp: ConstructionSalesDateTimeResponseModel.nullable(),
  /** Overdue / Today / Upcoming / None for an Open inquiry; null once closed. */
  due: due.nullable(),
  assignee: named.nullable(),
  leadOwner: named.nullable(),
  remarks: z.string().nullable(),
  /** Set while Converted (CM-1007). */
  convertedUnitId: z.uuid().nullable(),
  convertedBookingId: z.uuid().nullable(),
  /** The converted unit, as "A Wing 101". */
  convertedUnit: named.nullable(),
  /** Set while Lost (CM-1007). */
  lostReason: named.nullable(),
  lostRemarks: z.string().nullable(),
  closedAt: z.iso.datetime().nullable(),
  createdBy: person,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: ConstructionSalesInquiryActionsResponseModel,
});
export type ConstructionSalesInquiryResponse = z.infer<
  typeof ConstructionSalesInquiryResponseModel
>;

export const ConstructionSalesInquiryHistoryItemResponseModel = z.object({
  id: z.uuid(),
  type: z.enum(INQUIRY_EVENT_TYPES),
  /**
   * `{ stageId, assigneeMemberId, leadOwnerMemberId }` for `created`;
   * `{ fromMemberId, toMemberId }` for `assigned` and `lead_owner_changed`;
   * `{ fromStageId, toStageId }` for `stage_moved`;
   * `{ unitId, bookingId, bookingDate }` for `converted`;
   * `{ lostReasonId, remarks }` for `lost`; `{ from, stageId, bookingId }`
   * for `reopened`.
   */
  details: z.record(z.string(), z.unknown()).nullable(),
  /** The names of the members and stages `details` names, by key. */
  names: z.record(z.string(), z.string().nullable()),
  by: person,
  at: z.iso.datetime(),
});
export type ConstructionSalesInquiryHistoryItemResponse = z.infer<
  typeof ConstructionSalesInquiryHistoryItemResponseModel
>;

export const ConstructionSalesInquiryDetailResponseModel =
  ConstructionSalesInquiryResponseModel.extend({
    /** What happened to it, oldest first. */
    history: z.array(ConstructionSalesInquiryHistoryItemResponseModel),
  });
export type ConstructionSalesInquiryDetailResponse = z.infer<
  typeof ConstructionSalesInquiryDetailResponseModel
>;

export const ListConstructionSalesInquiriesResponseModel = z.object({
  items: z.array(ConstructionSalesInquiryResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
export type ListConstructionSalesInquiriesResponse = z.infer<
  typeof ListConstructionSalesInquiriesResponseModel
>;

/** `details` of 409 `INQUIRY_DUPLICATE`. */
export const ConstructionSalesInquiryDuplicateDetailsModel = z.object({
  matches: z.array(
    z.object({
      id: z.uuid(),
      /** Null for an inquiry the caller may not see (no View all). */
      name: z.string().nullable(),
      status,
    }),
  ),
});
export type ConstructionSalesInquiryDuplicateDetails = z.infer<
  typeof ConstructionSalesInquiryDuplicateDetailsModel
>;

const option = z.object({ id: z.uuid(), name: z.string() });

export const GetConstructionSalesInquiryFormOptionsResponseModel = z.object({
  /** Active Team Members on the Project (the Owner first). */
  members: z.array(option.extend({ isOwner: z.boolean() })),
  /** Live Wings of the Project (none on a Project with Locations). */
  wings: z.array(option),
  /** In funnel order. */
  funnelStages: z.array(option),
  /** Enabled ones. */
  leadSources: z.array(option),
  lostReasons: z.array(option),
  /** The caller's Team Member when on the Project: the default people. */
  viewerMemberId: z.uuid().nullable(),
});
export type GetConstructionSalesInquiryFormOptionsResponse = z.infer<
  typeof GetConstructionSalesInquiryFormOptionsResponseModel
>;

type Body = z.infer<typeof InquiryBody>;

/** A request body as the handlers take it. */
export function toInquiryWriteInput(body: Body): InquiryWriteInput {
  return {
    inquiryDate: body.inquiryDate,
    name: body.name,
    mobile: body.mobile,
    email: body.email,
    address: body.address,
    occupation: body.occupation,
    interestType: body.interestType,
    interestedWingId: body.interestedWingId,
    interestedUnitType: body.interestedUnitType,
    leadSourceId: body.leadSourceId,
    funnelStageId: body.funnelStageId,
    nextFollowUp:
      body.nextFollowUpDate == null
        ? null
        : { date: body.nextFollowUpDate, time: body.nextFollowUpTime ?? null },
    assigneeMemberId: body.assigneeMemberId,
    leadOwnerMemberId: body.leadOwnerMemberId,
    remarks: body.remarks,
  };
}

const iso = (value: Date | null) =>
  value == null ? null : value.toISOString();

export function toInquiryResponse(
  inquiry: InquiryReadModel,
  actions: InquiryActions,
): ConstructionSalesInquiryResponse {
  return {
    id: inquiry.id,
    projectId: inquiry.projectId,
    inquiryDate: inquiry.inquiryDate,
    name: inquiry.name,
    mobile: inquiry.mobile,
    email: inquiry.email,
    address: inquiry.address,
    occupation: inquiry.occupation,
    interestType: inquiry.interestType,
    interestedWing: inquiry.interestedWing,
    interestedUnitType: inquiry.interestedUnitType,
    leadSource: inquiry.leadSource,
    funnelStage: inquiry.funnelStage,
    status: inquiry.status,
    nextFollowUp: inquiry.nextFollowUp,
    due: inquiry.due,
    assignee: inquiry.assignee,
    leadOwner: inquiry.leadOwner,
    remarks: inquiry.remarks,
    convertedUnitId: inquiry.convertedUnitId,
    convertedBookingId: inquiry.convertedBookingId,
    convertedUnit: inquiry.convertedUnit,
    lostReason: inquiry.lostReason,
    lostRemarks: inquiry.lostRemarks,
    closedAt: iso(inquiry.closedAt),
    createdBy: inquiry.createdByPerson,
    createdAt: inquiry.createdAt.toISOString(),
    updatedAt: inquiry.updatedAt.toISOString(),
    actions,
  };
}

export function toInquiryHistoryResponse(
  item: InquiryHistoryItem,
): ConstructionSalesInquiryHistoryItemResponse {
  return {
    id: item.id,
    type: item.type,
    details: item.details,
    names: item.names,
    by: item.by,
    at: item.occurredAt.toISOString(),
  };
}

export function toInquiryDetailResponse(
  inquiry: InquiryReadModel & { history: InquiryHistoryItem[] },
  actions: InquiryActions,
): ConstructionSalesInquiryDetailResponse {
  return {
    ...toInquiryResponse(inquiry, actions),
    history: inquiry.history.map(toInquiryHistoryResponse),
  };
}

export function toInquiryFormOptions(
  options: InquiryFormOptions,
): GetConstructionSalesInquiryFormOptionsResponse {
  return {
    members: options.members.map((member) => ({
      id: member.id,
      name: member.name,
      isOwner: member.isOwner,
    })),
    wings: options.wings,
    funnelStages: options.funnelStages,
    leadSources: options.leadSources,
    lostReasons: options.lostReasons,
    viewerMemberId: options.viewerMemberId,
  };
}
