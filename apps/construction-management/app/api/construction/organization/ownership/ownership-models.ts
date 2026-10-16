import { z } from "zod";

import { ActionCodeField } from "../action-codes/action-code-models";

export const OWNERSHIP_PATH = "/api/construction/organization/ownership";

/** Who the Owner may hand the Company to: active, joined, Normal Team Members. */
export const ListConstructionOrganizationOwnershipCandidatesResponseModel =
  z.object({
    items: z.array(
      z.object({
        id: z.string().describe("Team Member id"),
        name: z.string(),
        designation: z.string().nullable(),
      }),
    ),
  });

export type ListConstructionOrganizationOwnershipCandidatesResponseModel =
  z.infer<typeof ListConstructionOrganizationOwnershipCandidatesResponseModel>;

/** Transfer ownership (CM-907, ADR CM-0021 §10). */
export const TransferConstructionOrganizationOwnershipRequestModel = z.object({
  memberId: z
    .string()
    .min(1)
    .max(100)
    .describe("The new Owner's Team Member id"),
  code: ActionCodeField.describe("The `transfer_ownership` code"),
});

export type TransferConstructionOrganizationOwnershipRequestModel = z.infer<
  typeof TransferConstructionOrganizationOwnershipRequestModel
>;

export const TransferConstructionOrganizationOwnershipResponseModel = z.object({
  ownerId: z.string().describe("The new Owner's Team Member id"),
});

export type TransferConstructionOrganizationOwnershipResponseModel = z.infer<
  typeof TransferConstructionOrganizationOwnershipResponseModel
>;
