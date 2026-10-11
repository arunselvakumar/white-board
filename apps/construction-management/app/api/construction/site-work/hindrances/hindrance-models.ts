import { z } from "zod";

import {
  ConstructionProcurementSiteLocationModel,
  ConstructionProcurementSiteLocationResponseModel,
} from "@/app/api/construction/procurement/purchase-requests/purchase-request-models";
import type {
  HindranceActions,
  HindranceFormOptions,
  HindranceReadModel,
} from "@/src/site-work/application/hindrance-handlers";
import {
  HINDRANCE_CAUSES,
  HINDRANCE_LIMITS,
  HINDRANCE_STATUSES,
  RESPONSIBLE_PARTIES,
} from "@/src/site-work/domain/hindrance";

export const HINDRANCES_PATH = "/api/construction/site-work/hindrances";

const cause = z.enum(HINDRANCE_CAUSES);
const party = z.enum(RESPONSIBLE_PARTIES);
const status = z.enum(HINDRANCE_STATUSES);
/** ≥ 0, two decimals at most (a decimal string or a number). */
const hours = z.union([z.string().max(12), z.number().nonnegative()]);

const HindranceBody = z.object({
  /** `YYYY-MM-DD`, not after today; the back-dated limit applies to it. */
  startDate: z.iso.date(),
  /** On or after the start, not after today; empty while it continues. */
  endDate: z.iso.date().nullable().optional(),
  hoursLost: hours.nullable().optional(),
  cause,
  affectedActivity: z.string().max(HINDRANCE_LIMITS.affectedActivity),
  /** A place on the Project, checked against it on save. */
  siteLocation: ConstructionProcurementSiteLocationModel.nullable().optional(),
  responsibleParty: party,
  /** Required when the party is `contractor`: a Contractor assigned to the Project. Ignored otherwise. */
  contractorId: z.uuid().nullable().optional(),
  description: z
    .string()
    .max(HINDRANCE_LIMITS.description)
    .nullable()
    .optional(),
  /** A live Equipment Usage sheet on the Project (Record hindrance from a usage sheet). */
  equipmentUsageSheetId: z.uuid().nullable().optional(),
  /**
   * Joint sign-off, recorded (not an approval). The other party's name and
   * the date go together; the Team Member is assigned to the Project or
   * is the Owner.
   */
  signOff: z
    .object({
      userId: z.string().max(100).nullable().optional(),
      partyName: z
        .string()
        .max(HINDRANCE_LIMITS.partyName)
        .nullable()
        .optional(),
      partyRole: z
        .string()
        .max(HINDRANCE_LIMITS.partyRole)
        .nullable()
        .optional(),
      signedOn: z.iso.date().nullable().optional(),
    })
    .nullable()
    .optional(),
});

export const CreateConstructionSiteWorkHindranceRequestModel =
  HindranceBody.extend({ projectId: z.uuid() });

export const UpdateConstructionSiteWorkHindranceRequestModel =
  HindranceBody.extend({
    /** The hindrance's `updatedAt` as last seen; 409 `HINDRANCE_CHANGED` when stale. */
    expectedUpdatedAt: z.iso.datetime(),
  });

export const CloseConstructionSiteWorkHindranceRequestModel = z.object({
  /** On or after the start date, not after today. */
  endDate: z.iso.date(),
  /** Leaves the hours as they were when omitted; null clears them. */
  hoursLost: hours.nullable().optional(),
  expectedUpdatedAt: z.iso.datetime(),
});

export const DeleteConstructionSiteWorkHindranceRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

export const ConstructionSiteWorkHindranceParamsModel = z.object({
  id: z.uuid(),
});

export const GetConstructionSiteWorkHindranceFormOptionsRequestModel = z.object(
  { projectId: z.uuid() },
);

export const ListConstructionSiteWorkHindrancesRequestModel = z
  .object({
    projectId: z.uuid(),
    status: status.optional(),
    cause: cause.optional(),
    responsibleParty: party.optional(),
    contractorId: z.uuid().optional(),
    /** Hindrances overlapping `from`–`to` (either end may be left out). */
    from: z.iso.date().optional(),
    to: z.iso.date().optional(),
    /** Part of the number or the affected activity. */
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

// Responses

const person = z.object({ userId: z.string(), name: z.string().nullable() });

export const ConstructionSiteWorkHindranceActionsResponseModel = z.object({
  edit: z.boolean(),
  /** Update, while open. */
  close: z.boolean(),
  delete: z.boolean(),
  print: z.boolean(),
});

export const ConstructionSiteWorkHindranceResponseModel = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  /** `HR/26-27/00001`. */
  number: z.string(),
  startDate: z.iso.date(),
  endDate: z.iso.date().nullable(),
  /** Open while there is no end date. */
  status,
  /** Calendar days, both ends counted; up to today while open. */
  daysLost: z.number().int(),
  /** Decimal string. */
  hoursLost: z.string().nullable(),
  cause,
  affectedActivity: z.string(),
  siteLocation: ConstructionProcurementSiteLocationResponseModel.nullable(),
  responsibleParty: party,
  contractor: z
    .object({ id: z.uuid(), name: z.string().nullable() })
    .nullable(),
  description: z.string().nullable(),
  equipmentUsageSheet: z
    .object({ id: z.uuid(), number: z.string(), sheetDate: z.iso.date() })
    .nullable(),
  signOff: z
    .object({
      teamMember: person.nullable(),
      partyName: z.string(),
      partyRole: z.string().nullable(),
      signedOn: z.iso.date(),
    })
    .nullable(),
  createdBy: person,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  actions: ConstructionSiteWorkHindranceActionsResponseModel,
});
export type ConstructionSiteWorkHindranceResponse = z.infer<
  typeof ConstructionSiteWorkHindranceResponseModel
>;

export const ListConstructionSiteWorkHindrancesResponseModel = z.object({
  items: z.array(ConstructionSiteWorkHindranceResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.number().int(),
});
export type ListConstructionSiteWorkHindrancesResponse = z.infer<
  typeof ListConstructionSiteWorkHindrancesResponseModel
>;

export const GetConstructionSiteWorkHindranceFormOptionsResponseModel =
  z.object({
    /** Live Contractors assigned to the Project. */
    contractors: z.array(
      z.object({ id: z.uuid(), name: z.string(), isActive: z.boolean() }),
    ),
    /** Who may sign off for the Company: Team Members on the Project, and the Owner. */
    teamMembers: z.array(
      z.object({ userId: z.string(), name: z.string(), isOwner: z.boolean() }),
    ),
  });
export type GetConstructionSiteWorkHindranceFormOptionsResponse = z.infer<
  typeof GetConstructionSiteWorkHindranceFormOptionsResponseModel
>;

export function toHindranceResponse(
  h: HindranceReadModel,
  actions: HindranceActions,
): ConstructionSiteWorkHindranceResponse {
  return {
    id: h.id,
    projectId: h.projectId,
    number: h.number,
    startDate: h.startDate,
    endDate: h.endDate,
    status: h.status,
    daysLost: h.daysLost,
    hoursLost: h.hoursLost,
    cause: h.cause,
    affectedActivity: h.affectedActivity,
    siteLocation:
      h.siteLocation == null
        ? null
        : (h.siteLocation as z.infer<
            typeof ConstructionProcurementSiteLocationResponseModel
          >),
    responsibleParty: h.responsibleParty,
    contractor:
      h.contractorId == null
        ? null
        : { id: h.contractorId, name: h.contractorName },
    description: h.description,
    equipmentUsageSheet: h.equipmentUsageSheet,
    signOff:
      h.signOff == null
        ? null
        : {
            teamMember:
              h.signOff.userId == null
                ? null
                : { userId: h.signOff.userId, name: h.signOffUserName },
            partyName: h.signOff.partyName,
            partyRole: h.signOff.partyRole,
            signedOn: h.signOff.signedOn,
          },
    createdBy: { userId: h.createdBy, name: h.createdByName },
    createdAt: h.createdAt.toISOString(),
    updatedAt: h.updatedAt.toISOString(),
    actions,
  };
}

export function toHindranceFormOptions(
  options: HindranceFormOptions,
): GetConstructionSiteWorkHindranceFormOptionsResponse {
  return options;
}
