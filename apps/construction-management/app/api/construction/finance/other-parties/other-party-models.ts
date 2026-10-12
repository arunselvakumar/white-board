import { z } from "zod";

import type { OtherPartyReadModel } from "@/src/finance/application/other-party-handlers";
import { gstStateName } from "@/src/shared-kernel/gst-states";

export const OTHER_PARTIES_PATH = "/api/construction/finance/other-parties";

const fields = {
  name: z
    .string()
    .max(1000)
    .describe(
      "Required, at most 120 characters; unique among live Other Parties ignoring case (409 OTHER_PARTY_NAME_TAKEN).",
    ),
  mobile: z
    .string()
    .max(40)
    .nullable()
    .optional()
    .describe("An Indian mobile in any common format; stored as E.164."),
  email: z.string().max(1000).nullable().optional(),
  gstin: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe(
      "15 characters with a valid check character (400 GSTIN_INVALID); fills the GST state.",
    ),
  pan: z.string().max(30).nullable().optional(),
  stateCode: z
    .string()
    .max(10)
    .nullable()
    .optional()
    .describe(
      "GST state code (400 GST_STATE_INVALID). With a GSTIN the state is its first two digits; a different one is 400 GSTIN_STATE_MISMATCH.",
    ),
  address: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe("At most 500 characters."),
  projectIds: z
    .array(z.uuid())
    .max(500)
    .optional()
    .default([])
    .describe(
      "Live Projects of the Active Company it works on (400 PROJECT_NOT_FOUND).",
    ),
};

export const CreateConstructionFinanceOtherPartyRequestModel = z.object(fields);
export type CreateConstructionFinanceOtherPartyRequestModel = z.input<
  typeof CreateConstructionFinanceOtherPartyRequestModel
>;

export const UpdateConstructionFinanceOtherPartyRequestModel = z.object({
  ...fields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded; 409 OTHER_PARTY_CHANGED when someone saved since.",
    ),
});
export type UpdateConstructionFinanceOtherPartyRequestModel = z.input<
  typeof UpdateConstructionFinanceOtherPartyRequestModel
>;

export const DeleteConstructionFinanceOtherPartyRequestModel = z.object({
  expectedUpdatedAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe("When sent, 409 OTHER_PARTY_CHANGED if someone saved since."),
});

export const ConstructionFinanceOtherPartyParamsModel = z.object({
  id: z.uuid(),
});

export const ListConstructionFinanceOtherPartiesRequestModel = z
  .object({
    q: z
      .string()
      .trim()
      .max(100)
      .optional()
      .describe("Name, email, GSTIN or mobile."),
    projectId: z.uuid().optional().describe("Only those on this Project."),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

const ref = z.object({ id: z.uuid(), name: z.string() });

export const ConstructionFinanceOtherPartyResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  /** E.164. */
  mobile: z.string().nullable(),
  email: z.string().nullable(),
  gstin: z.string().nullable(),
  pan: z.string().nullable(),
  stateCode: z
    .string()
    .nullable()
    .describe("The GSTIN's first two digits, or the one picked."),
  stateName: z.string().nullable(),
  address: z.string().nullable(),
  projects: z.array(ref).describe("Live Projects, by name."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionFinanceOtherPartyResponseModel = z.infer<
  typeof ConstructionFinanceOtherPartyResponseModel
>;

export const ListConstructionFinanceOtherPartiesResponseModel = z.object({
  items: z.array(ConstructionFinanceOtherPartyResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});
export type ListConstructionFinanceOtherPartiesResponseModel = z.infer<
  typeof ListConstructionFinanceOtherPartiesResponseModel
>;

export function toOtherPartyResponse(
  party: OtherPartyReadModel,
): ConstructionFinanceOtherPartyResponseModel {
  return {
    id: party.id,
    name: party.name,
    mobile: party.mobile,
    email: party.email,
    gstin: party.gstin,
    pan: party.pan,
    stateCode: party.stateCode,
    stateName: party.stateCode == null ? null : gstStateName(party.stateCode),
    address: party.address,
    projects: [...party.projects].sort((a, b) => a.name.localeCompare(b.name)),
    createdAt: party.createdAt.toISOString(),
    updatedAt: party.updatedAt.toISOString(),
  };
}
