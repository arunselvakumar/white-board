import { z } from "zod";

import type {
  ContactReadModel,
  ProspectCompanyActions,
  ProspectCompanyFormOptions,
  ProspectCompanyListItem,
  ProspectCompanyReadModel,
  ProspectCompanyTimelineItem,
} from "@/src/marketing/application/prospect-company-handlers";
import {
  COMPANY_SOURCES,
  LOST_REASONS,
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_TYPES,
  MARKETING_LIMITS,
  STAGES,
  VISIT_PURPOSES,
  VISIT_SHOWN_STATUSES,
} from "@/src/marketing/domain/marketing-terms";

export const COMPANIES_PATH = "/api/construction/marketing/companies";

const stage = z.enum(STAGES);
const lostReason = z.enum(LOST_REASONS);
const source = z.enum(COMPANY_SOURCES);

/** Twice the stored limit: the domain trims, then says what is too long. */
const optionalText = (max: number) =>
  z
    .string()
    .max(max * 2)
    .nullable()
    .optional();

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

const ContactBody = z.object({
  /** Required. */
  name: z.string().max(MARKETING_LIMITS.name * 2),
  jobTitle: optionalText(MARKETING_LIMITS.jobTitle),
  /**
   * Ten digits become `+91…`; any other number must be `+` and 8–15 digits
   * (400 `CONTACT_MOBILE_INVALID`).
   */
  mobile: optionalText(20),
  email: optionalText(MARKETING_LIMITS.email),
  remarks: optionalText(MARKETING_LIMITS.remarks),
});

/** A field left out is empty. */
const CompanyBody = z.object({
  /**
   * Required; unique among the Company's live Prospect Companies ignoring
   * case and spacing (409 `PROSPECT_COMPANY_NAME_IN_USE`).
   */
  name: z.string().max(MARKETING_LIMITS.name * 2),
  industry: optionalText(MARKETING_LIMITS.industry),
  address: optionalText(MARKETING_LIMITS.address),
  city: optionalText(MARKETING_LIMITS.city),
  /** GST state code; set from the GSTIN when it has one. */
  stateCode: z.string().max(2).nullable().optional(),
  /** Six digits. */
  pin: optionalText(6),
  phone: optionalText(MARKETING_LIMITS.phone),
  email: optionalText(MARKETING_LIMITS.email),
  website: optionalText(MARKETING_LIMITS.website),
  /** Checked with its checksum (400 `PROSPECT_COMPANY_GSTIN_INVALID`). */
  gstin: optionalText(15),
  source: source.nullable().optional(),
  remarks: optionalText(MARKETING_LIMITS.remarks),
});

export const CreateConstructionMarketingProspectCompanyRequestModel =
  CompanyBody.extend({
    /**
     * An active Marketing Person (400 `MARKETING_PERSON_NOT_FOUND`); the
     * creator when left out, if they are one; null for nobody.
     */
    assignedMemberId: z.uuid().nullable().optional(),
    /** A first Contact, made primary. */
    primaryContact: ContactBody.nullable().optional(),
  });

/** Edit: every detail is sent; the assigned person moves only by Reassign. */
export const UpdateConstructionMarketingProspectCompanyRequestModel =
  CompanyBody.extend({
    /** The company's `updatedAt` as last seen; 409 `PROSPECT_COMPANY_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DeleteConstructionMarketingProspectCompanyRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

/** A Stage moved by hand. */
export const MoveConstructionMarketingProspectCompanyStageRequestModel =
  z.object({
    /**
     * Requirement received, Quotation sent, Negotiation, Won or Lost (400
     * `STAGE_NOT_MANUAL` for New and Contacted; `STAGE_UNCHANGED`, but
     * Lost to Lost may change the Lost Reason).
     */
    stage,
    /** Required for Lost (400 `LOST_REASON_REQUIRED`). */
    lostReason: lostReason.nullable().optional(),
    /** Required for Other (400 `LOST_REASON_TEXT_REQUIRED`). */
    lostReasonText: optionalText(MARKETING_LIMITS.lostReasonText),
    expectedUpdatedAt: z.iso.datetime(),
  });

export const CreateConstructionMarketingContactRequestModel =
  ContactBody.extend({
    /** Make it the primary Contact; the company's first Contact always is. */
    isPrimary: z.boolean().optional(),
  });

export const UpdateConstructionMarketingContactRequestModel =
  ContactBody.extend({
    /**
     * True makes it the primary Contact; false on the primary one is 400
     * `CONTACT_PRIMARY_REQUIRED`.
     */
    isPrimary: z.boolean().optional(),
    /** The Contact's `updatedAt` as last seen; 409 `CONTACT_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DeleteConstructionMarketingContactRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ConstructionMarketingProspectCompanyParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionMarketingContactParamsModel = z.object({
  id: z.uuid(),
  contactId: z.uuid(),
});

export const ListConstructionMarketingProspectCompaniesRequestModel = z.object({
  /** Part of the name, city, a Contact's name or a Contact's mobile. */
  search: z.string().max(100).optional(),
  /** Comma-separated Stages. */
  stage: commaSeparated.pipe(z.array(stage)).optional(),
  assignedMemberId: z.uuid().optional(),
  /** Exactly this industry, ignoring case. */
  industry: z
    .string()
    .max(MARKETING_LIMITS.industry * 2)
    .optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** `nextCursor` of the previous page; empty means the first page. */
  after: z.string().max(400).optional(),
});

/** Reassign: the company and its open Follow-ups to another person. */
export const ReassignConstructionMarketingProspectCompanyRequestModel =
  z.object({
    /** An active Marketing Person (400 `MARKETING_PERSON_NOT_FOUND`). */
    assignedMemberId: z.uuid(),
    expectedUpdatedAt: z.iso.datetime(),
  });

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const Person = z.object({ id: z.uuid(), name: z.string() });

export const ConstructionMarketingProspectCompanyActionsResponseModel =
  z.object({
    /** Edit, Stage and Contacts (Companies update). */
    canUpdate: z.boolean(),
    canDelete: z.boolean(),
    /** Companies transfer: Reassign. */
    canReassign: z.boolean(),
  });

export const ConstructionMarketingProspectCompanyListItemResponseModel =
  z.object({
    id: z.uuid(),
    name: z.string(),
    industry: z.string().nullable(),
    city: z.string().nullable(),
    stateCode: z.string().nullable(),
    stage,
    assignedTo: Person.nullable(),
    primaryContact: z
      .object({ name: z.string(), mobile: z.string().nullable() })
      .nullable(),
    /** The latest completed Visit the viewer may see. */
    lastVisitAt: z.iso.datetime().nullable(),
    /** The earliest open Follow-up the viewer may see. */
    nextFollowUpOn: z.iso.date().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  });

export const ListConstructionMarketingProspectCompaniesResponseModel = z.object(
  {
    items: z.array(ConstructionMarketingProspectCompanyListItemResponseModel),
    /** Pass as `after` for the next page; null on the last. */
    nextCursor: z.string().nullable(),
    total: z.number().int(),
    /** The Company's time zone, for Last visit. */
    timeZone: z.string(),
  },
);

export const ConstructionMarketingContactResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  jobTitle: z.string().nullable(),
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  remarks: z.string().nullable(),
  isPrimary: z.boolean(),
  updatedAt: z.iso.datetime(),
});

export const ConstructionMarketingTimelineItemResponseModel =
  z.discriminatedUnion("kind", [
    z.object({
      /** A Stage change. */
      kind: z.literal("stage"),
      id: z.uuid(),
      /** Null on the first entry: the company was added at New. */
      fromStage: stage.nullable(),
      toStage: stage,
      lostReason: lostReason.nullable(),
      lostReasonText: z.string().nullable(),
      at: z.iso.datetime(),
      byName: z.string(),
    }),
    z.object({
      /** A Visit the viewer may see, at its time. */
      kind: z.literal("visit"),
      id: z.uuid(),
      number: z.string(),
      at: z.iso.datetime(),
      status: z.enum(VISIT_SHOWN_STATUSES),
      purpose: z.enum(VISIT_PURPOSES).nullable(),
      outcome: z.string().nullable(),
      visitorNames: z.array(z.string()),
    }),
    z.object({
      /** A Follow-up the viewer may see: where it was done, or made. */
      kind: z.literal("follow_up"),
      id: z.uuid(),
      visitId: z.uuid().nullable(),
      visitNumber: z.string().nullable(),
      type: z.enum(FOLLOW_UP_TYPES),
      status: z.enum(FOLLOW_UP_STATUSES),
      dueDate: z.iso.date(),
      ownerName: z.string(),
      note: z.string().nullable(),
      resultNote: z.string().nullable(),
      at: z.iso.datetime(),
    }),
    z.object({
      /** A photo or file added to one of those Visits. */
      kind: z.literal("file"),
      id: z.uuid(),
      visitId: z.uuid(),
      visitNumber: z.string(),
      fileName: z.string(),
      caption: z.string().nullable(),
      at: z.iso.datetime(),
      byName: z.string(),
    }),
    z.object({
      /** A note added to one of those Visits. */
      kind: z.literal("note"),
      id: z.uuid(),
      visitId: z.uuid(),
      visitNumber: z.string(),
      text: z.string(),
      at: z.iso.datetime(),
      byName: z.string(),
    }),
  ]);

export const ConstructionMarketingProspectCompanyResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  industry: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  stateCode: z.string().nullable(),
  pin: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  gstin: z.string().nullable(),
  source: source.nullable(),
  remarks: z.string().nullable(),
  assignedTo: Person.nullable(),
  stage,
  lostReason: lostReason.nullable(),
  lostReasonText: z.string().nullable(),
  createdByName: z.string(),
  /** The Company's time zone (IANA); the page shows times in it. */
  timeZone: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  contacts: z.array(ConstructionMarketingContactResponseModel),
  /** Newest first. */
  timeline: z.array(ConstructionMarketingTimelineItemResponseModel),
  actions: ConstructionMarketingProspectCompanyActionsResponseModel,
  /**
   * Open Follow-ups of the company, whoever owns them: Reassign moves them
   * too. Null without Companies transfer.
   */
  openFollowUps: z.number().int().nullable(),
});

export const GetConstructionMarketingProspectCompanyFormOptionsResponseModel =
  z.object({
    /** Marketing People; the form offers only the active ones. */
    people: z.array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        mobile: z.string().nullable(),
        isOwner: z.boolean(),
        active: z.boolean(),
      }),
    ),
    /** Industries already typed, A–Z. */
    industries: z.array(z.string()),
  });

export type ListConstructionMarketingProspectCompaniesResponse = z.infer<
  typeof ListConstructionMarketingProspectCompaniesResponseModel
>;
export type ConstructionMarketingProspectCompanyResponse = z.infer<
  typeof ConstructionMarketingProspectCompanyResponseModel
>;
export type ConstructionMarketingProspectCompanyListItemResponse = z.infer<
  typeof ConstructionMarketingProspectCompanyListItemResponseModel
>;
export type GetConstructionMarketingProspectCompanyFormOptionsResponse =
  z.infer<
    typeof GetConstructionMarketingProspectCompanyFormOptionsResponseModel
  >;

export function toProspectCompanyListItemResponse(
  item: ProspectCompanyListItem,
): ConstructionMarketingProspectCompanyListItemResponse {
  return {
    ...item,
    lastVisitAt: item.lastVisitAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

function toContactResponse(contact: ContactReadModel) {
  return {
    id: contact.id,
    name: contact.name,
    jobTitle: contact.jobTitle,
    mobile: contact.mobile,
    email: contact.email,
    remarks: contact.remarks,
    isPrimary: contact.isPrimary,
    updatedAt: contact.updatedAt.toISOString(),
  };
}

function toTimelineResponse(item: ProspectCompanyTimelineItem) {
  return { ...item, at: item.at.toISOString() };
}

const toActions = (actions: ProspectCompanyActions) => ({ ...actions });

export function toProspectCompanyResponse(
  company: ProspectCompanyReadModel,
): ConstructionMarketingProspectCompanyResponse {
  return {
    id: company.id,
    name: company.name,
    industry: company.industry,
    address: company.address,
    city: company.city,
    stateCode: company.stateCode,
    pin: company.pin,
    phone: company.phone,
    email: company.email,
    website: company.website,
    gstin: company.gstin,
    source: company.source,
    remarks: company.remarks,
    assignedTo: company.assignedTo,
    stage: company.stage,
    lostReason: company.lostReason,
    lostReasonText: company.lostReasonText,
    createdByName: company.createdByName,
    timeZone: company.timeZone,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString(),
    contacts: company.contacts.map(toContactResponse),
    timeline: company.timeline.map(toTimelineResponse),
    actions: toActions(company.actions),
    openFollowUps: company.openFollowUps,
  };
}

export function toProspectCompanyFormOptions(
  options: ProspectCompanyFormOptions,
): GetConstructionMarketingProspectCompanyFormOptionsResponse {
  return {
    people: options.people.map((person) => ({ ...person })),
    industries: options.industries,
  };
}
