import { z } from "zod";

import type {
  FollowUpFormOptions,
  FollowUpReadModel,
} from "@/src/marketing/application/follow-up-handlers";
import {
  FOLLOW_UP_DUES,
  FOLLOW_UP_LIMITS,
  FOLLOW_UP_STATUSES,
  FOLLOW_UP_TYPES,
} from "@/src/marketing/domain/marketing-terms";

export const FOLLOW_UPS_PATH = "/api/construction/marketing/follow-ups";

const type = z.enum(FOLLOW_UP_TYPES);
const status = z.enum(FOLLOW_UP_STATUSES);

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

const optionalText = (max: number) =>
  z
    .string()
    .max(max * 2)
    .nullable()
    .optional();

const FollowUpBody = z.object({
  type,
  /** `YYYY-MM-DD`, the Company's calendar. */
  dueDate: z.iso.date(),
  /**
   * An active Marketing Person (400 `MARKETING_PERSON_NOT_FOUND`); the
   * creator when left out. Without View all it may be a colleague: the
   * creator keeps seeing it.
   */
  ownerMemberId: z.uuid().optional(),
  note: optionalText(FOLLOW_UP_LIMITS.note),
});

export const CreateConstructionMarketingFollowUpRequestModel =
  FollowUpBody.extend({
    /** Any live Prospect Company of the Company. */
    prospectCompanyId: z.uuid(),
    /** A Visit to that company the caller can see. */
    visitId: z.uuid().nullable().optional(),
  });

/** An Open one; a new due date clears its reminders. */
export const UpdateConstructionMarketingFollowUpRequestModel =
  FollowUpBody.extend({
    /** 409 `FOLLOW_UP_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const DoneConstructionMarketingFollowUpRequestModel = z.object({
  resultNote: optionalText(FOLLOW_UP_LIMITS.resultNote),
  /** Today when left out; never after today. */
  doneOn: z.iso.date().nullable().optional(),
  expectedUpdatedAt: z.iso.datetime(),
});

export const CloseConstructionMarketingFollowUpRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ConstructionMarketingFollowUpParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionMarketingFollowUpsRequestModel = z.object({
  /** `1`: only those the caller owns, as the list opens. */
  mine: z.enum(["1"]).optional(),
  ownerMemberId: z.uuid().optional(),
  /** Comma-separated; every status when left out. */
  status: commaSeparated.pipe(z.array(status)).optional(),
  prospectCompanyId: z.uuid().optional(),
  visitId: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  /** `nextCursor` of the previous page. */
  after: z.string().max(400).optional(),
});

const Ref = z.object({ id: z.uuid(), name: z.string() });

export const ConstructionMarketingFollowUpResponseModel = z.object({
  id: z.uuid(),
  prospectCompany: Ref.extend({ canOpen: z.boolean() }),
  visit: z
    .object({ id: z.uuid(), number: z.string(), canOpen: z.boolean() })
    .nullable(),
  type,
  dueDate: z.iso.date(),
  /** Overdue, Today or Upcoming while Open, on the Company's today. */
  due: z.enum(FOLLOW_UP_DUES).nullable(),
  owner: Ref,
  note: z.string().nullable(),
  status,
  resultNote: z.string().nullable(),
  doneOn: z.iso.date().nullable(),
  createdByName: z.string(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: z.object({
    canUpdate: z.boolean(),
    canClose: z.boolean(),
    canDelete: z.boolean(),
  }),
});

export const ListConstructionMarketingFollowUpsResponseModel = z.object({
  /** By due date, earliest first. */
  items: z.array(ConstructionMarketingFollowUpResponseModel),
  nextCursor: z.string().nullable(),
  total: z.number().int(),
  /** The Company's today. */
  today: z.iso.date(),
});

const ConstructionMarketingFollowUpPersonResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  mobile: z.string().nullable(),
  isOwner: z.boolean(),
  /** False for someone no longer a Marketing Person or Team Member. */
  active: z.boolean(),
});

export const GetConstructionMarketingFollowUpFormOptionsResponseModel =
  z.object({
    /** Active Marketing People: the ones a Follow-up can be given to. */
    people: z.array(ConstructionMarketingFollowUpPersonResponseModel),
    /**
     * Inactive ones too (their Follow-ups remain): the list's owner
     * filter.
     */
    allPeople: z.array(ConstructionMarketingFollowUpPersonResponseModel),
    selfMemberId: z.uuid().nullable(),
    companies: z.array(Ref),
    today: z.iso.date(),
    /** With View all, the list can show everyone's. */
    canSeeAll: z.boolean(),
  });

export type ConstructionMarketingFollowUpResponse = z.infer<
  typeof ConstructionMarketingFollowUpResponseModel
>;

export function toFollowUpResponse(
  followUp: FollowUpReadModel,
): ConstructionMarketingFollowUpResponse {
  return {
    ...followUp,
    createdAt: followUp.createdAt.toISOString(),
    updatedAt: followUp.updatedAt.toISOString(),
    actions: { ...followUp.actions },
  };
}

export function toFollowUpFormOptions(options: FollowUpFormOptions) {
  return {
    ...options,
    people: options.people.map((person) => ({ ...person })),
    allPeople: options.allPeople.map((person) => ({ ...person })),
  };
}
