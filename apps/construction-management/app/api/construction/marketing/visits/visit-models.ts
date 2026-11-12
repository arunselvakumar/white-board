import { z } from "zod";

import type {
  VisitActions,
  VisitFormOptions,
  VisitListItem,
  VisitReadModel,
} from "@/src/marketing/application/visit-handlers";
import {
  INTERESTS,
  MARKETING_LIMITS,
  VISIT_LIMITS,
  VISIT_PURPOSES,
  VISIT_SHOWN_STATUSES,
  WORK_TYPES,
} from "@/src/marketing/domain/marketing-terms";

import { CreateConstructionMarketingProspectCompanyRequestModel } from "../companies/company-models";

export const VISITS_PATH = "/api/construction/marketing/visits";

const purpose = z.enum(VISIT_PURPOSES);
const interest = z.enum(INTERESTS);
const workType = z.enum(WORK_TYPES);
const shownStatus = z.enum(VISIT_SHOWN_STATUSES);

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

const NewContact = z.object({
  name: z.string().max(MARKETING_LIMITS.name * 2),
  jobTitle: optionalText(MARKETING_LIMITS.jobTitle),
  mobile: optionalText(20),
  email: optionalText(MARKETING_LIMITS.email),
});

const VisitBody = z.object({
  /** An instant (ISO 8601); the screens enter it in the Company time zone. */
  visitAt: z.iso.datetime({ offset: true }),
  purpose: purpose.nullable().optional(),
  /** Create: the Prospect Company's address when left out. */
  location: optionalText(VISIT_LIMITS.location),
  /** Required to complete (400 `VISIT_DISCUSSION_REQUIRED`). */
  discussion: optionalText(VISIT_LIMITS.discussion),
  outcome: optionalText(VISIT_LIMITS.outcome),
  interest: interest.nullable().optional(),
  requirementWorkType: workType.nullable().optional(),
  /** Approximate value in whole rupees. */
  requirementValue: z.number().int().min(0).nullable().optional(),
  /** `YYYY-MM`. */
  requirementStartMonth: z.string().max(7).nullable().optional(),
  /**
   * Active Marketing People; the creator when left out. Without View all
   * the caller must be one (400 `VISITOR_SELF_REQUIRED`).
   */
  visitorIds: z.array(z.uuid()).min(1).max(20).optional(),
  /**
   * Live Contacts of the Visit's company; one or more is required to
   * complete (400 `VISIT_CONTACT_REQUIRED`).
   */
  contactIds: z.array(z.uuid()).max(20).optional(),
  /**
   * Contacts added to the company in the same save; needs Companies update
   * on an existing company (Companies create covers a new one).
   */
  newContacts: z.array(NewContact).max(5).optional(),
});

export const CreateConstructionMarketingVisitRequestModel = VisitBody.extend({
  /** A live Prospect Company of the Company … */
  prospectCompanyId: z.uuid().optional(),
  /** … or one added in the same save (Companies create). */
  newProspectCompany:
    CreateConstructionMarketingProspectCompanyRequestModel.optional(),
  /**
   * `planned`, or `completed` to log a past Visit (not in the future,
   * within the back-dated limit, a point of contact and the Discussion).
   */
  status: z.enum(["planned", "completed"]),
}).refine(
  (body) =>
    (body.prospectCompanyId == null) !== (body.newProspectCompany == null),
  {
    message: "Send prospectCompanyId or newProspectCompany, not both.",
    path: ["prospectCompanyId"],
  },
);

export const UpdateConstructionMarketingVisitRequestModel = VisitBody.extend({
  prospectCompanyId: z.uuid(),
  /** The Visit's `updatedAt` as last seen; 409 `VISIT_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const CompleteConstructionMarketingVisitRequestModel = VisitBody.extend({
  expectedUpdatedAt: z.iso.datetime(),
});

export const RescheduleConstructionMarketingVisitRequestModel = z.object({
  visitAt: z.iso.datetime({ offset: true }),
  expectedUpdatedAt: z.iso.datetime(),
});

export const CancelConstructionMarketingVisitRequestModel = z.object({
  /** Required (400 `VISIT_CANCEL_REASON_REQUIRED`). */
  reason: z.string().max(VISIT_LIMITS.cancelReason * 2),
  expectedUpdatedAt: z.iso.datetime(),
});

export const AddConstructionMarketingVisitNoteRequestModel = z.object({
  text: z.string().max(VISIT_LIMITS.note * 2),
});

export const DeleteConstructionMarketingVisitRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ConstructionMarketingVisitParamsModel = z.object({ id: z.uuid() });

export const ListConstructionMarketingVisitsRequestModel = z.object({
  /** `YYYY-MM-DD`, in the Company time zone; inclusive. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  /** A visitor on the Visit. */
  memberId: z.uuid().optional(),
  prospectCompanyId: z.uuid().optional(),
  /** Comma-separated: planned, missed, completed, cancelled. */
  status: commaSeparated.pipe(z.array(shownStatus)).optional(),
  purpose: commaSeparated.pipe(z.array(purpose)).optional(),
  interest: commaSeparated.pipe(z.array(interest)).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  /** `nextCursor` of the previous page. */
  after: z.string().max(400).optional(),
});

// ---------------------------------------------------------------------------
// Responses
// ---------------------------------------------------------------------------

const Person = z.object({ id: z.uuid(), name: z.string() });

export const ConstructionMarketingVisitActionsResponseModel = z.object({
  canUpdate: z.boolean(),
  canComplete: z.boolean(),
  canCancel: z.boolean(),
  canReschedule: z.boolean(),
  canAddNote: z.boolean(),
  canDelete: z.boolean(),
  /** A Completed Visit past its 7 days for this viewer. */
  locked: z.boolean(),
});

const CompanyRef = z.object({
  id: z.uuid(),
  name: z.string(),
  /** The company page opens for the viewer (ADR CM-0040 §5). */
  canOpen: z.boolean(),
});

export const ConstructionMarketingVisitListItemResponseModel = z.object({
  id: z.uuid(),
  number: z.string(),
  prospectCompany: CompanyRef,
  visitAt: z.iso.datetime(),
  /** Missed: planned, and its time has passed. */
  status: shownStatus,
  purpose: purpose.nullable(),
  interest: interest.nullable(),
  outcome: z.string().nullable(),
  visitors: z.array(Person),
  contactNames: z.array(z.string()),
});

export const ListConstructionMarketingVisitsResponseModel = z.object({
  items: z.array(ConstructionMarketingVisitListItemResponseModel),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  timeZone: z.string(),
});

export const ConstructionMarketingVisitResponseModel = z.object({
  id: z.uuid(),
  number: z.string(),
  prospectCompany: CompanyRef.extend({
    address: z.string().nullable(),
    city: z.string().nullable(),
  }),
  visitAt: z.iso.datetime(),
  status: shownStatus,
  purpose: purpose.nullable(),
  location: z.string().nullable(),
  discussion: z.string().nullable(),
  outcome: z.string().nullable(),
  interest: interest.nullable(),
  requirementWorkType: workType.nullable(),
  /** Whole rupees; shown to everyone who can read the Visit. */
  requirementValue: z.number().int().nullable(),
  requirementStartMonth: z.string().nullable(),
  cancelReason: z.string().nullable(),
  completedAt: z.iso.datetime().nullable(),
  visitors: z.array(Person),
  contacts: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      jobTitle: z.string().nullable(),
      mobile: z.string().nullable(),
    }),
  ),
  /** Newest first. */
  notes: z.array(
    z.object({
      id: z.uuid(),
      text: z.string(),
      at: z.iso.datetime(),
      byName: z.string(),
    }),
  ),
  /** Newest first. */
  history: z.array(
    z.object({
      id: z.uuid(),
      action: z.enum([
        "created",
        "updated",
        "completed",
        "rescheduled",
        "cancelled",
        "note_added",
      ]),
      at: z.iso.datetime(),
      byName: z.string(),
      from: z.iso.datetime().nullable(),
      to: z.iso.datetime().nullable(),
      reason: z.string().nullable(),
    }),
  ),
  createdByName: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  timeZone: z.string(),
  actions: ConstructionMarketingVisitActionsResponseModel,
});

export const GetConstructionMarketingVisitFormOptionsResponseModel = z.object({
  people: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      mobile: z.string().nullable(),
      isOwner: z.boolean(),
      active: z.boolean(),
    }),
  ),
  selfMemberId: z.uuid().nullable(),
  mustIncludeSelf: z.boolean(),
  companies: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      address: z.string().nullable(),
      city: z.string().nullable(),
    }),
  ),
  canCreateCompany: z.boolean(),
  canAddContacts: z.boolean(),
  timeZone: z.string(),
});

export type ConstructionMarketingVisitResponse = z.infer<
  typeof ConstructionMarketingVisitResponseModel
>;
export type ListConstructionMarketingVisitsResponse = z.infer<
  typeof ListConstructionMarketingVisitsResponseModel
>;
export type GetConstructionMarketingVisitFormOptionsResponse = z.infer<
  typeof GetConstructionMarketingVisitFormOptionsResponseModel
>;

const iso = (value: Date | null) => value?.toISOString() ?? null;

export function toVisitListItemResponse(item: VisitListItem) {
  return { ...item, visitAt: item.visitAt.toISOString() };
}

const toActions = (actions: VisitActions) => ({ ...actions });

export function toVisitResponse(
  visit: VisitReadModel,
): ConstructionMarketingVisitResponse {
  return {
    ...visit,
    visitAt: visit.visitAt.toISOString(),
    completedAt: iso(visit.completedAt),
    createdAt: visit.createdAt.toISOString(),
    updatedAt: visit.updatedAt.toISOString(),
    notes: visit.notes.map((note) => ({
      ...note,
      at: note.at.toISOString(),
    })),
    history: visit.history.map((item) => ({
      ...item,
      at: item.at.toISOString(),
      from: iso(item.from),
      to: iso(item.to),
    })),
    actions: toActions(visit.actions),
  };
}

export function toVisitFormOptions(
  options: VisitFormOptions,
): GetConstructionMarketingVisitFormOptionsResponse {
  return {
    ...options,
    people: options.people.map((person) => ({ ...person })),
  };
}
