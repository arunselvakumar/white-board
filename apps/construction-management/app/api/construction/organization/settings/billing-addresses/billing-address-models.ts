import { z } from "zod";

import type { BillingAddress } from "@/src/organization/domain/billing-address";
import { gstStateName } from "@/src/shared-kernel/gst-states";

export const BILLING_ADDRESSES_PATH =
  "/api/construction/organization/settings/billing-addresses";

/** Fields of Add and Edit; the domain trims and checks each (CM-501). */
const writeFields = {
  name: z
    .string()
    .max(1000)
    .describe(
      "Required, at most 120 characters, unique among live addresses ignoring case (409 BILLING_ADDRESS_NAME_IN_USE).",
    ),
  address: z.string().max(2000).describe("Required, at most 500 characters."),
  stateCode: z
    .string()
    .max(10)
    .describe("GST state code, e.g. `33` (400 GST_STATE_INVALID)."),
  gstin: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe(
      "15 characters with a valid check character (400 GSTIN_INVALID), starting with `stateCode` (400 GSTIN_STATE_MISMATCH).",
    ),
};

export const CreateConstructionOrganizationBillingAddressRequestModel =
  z.object(writeFields);

export type CreateConstructionOrganizationBillingAddressRequestModel = z.input<
  typeof CreateConstructionOrganizationBillingAddressRequestModel
>;

export const UpdateConstructionOrganizationBillingAddressRequestModel =
  z.object({
    ...writeFields,
    expectedUpdatedAt: z.iso
      .datetime()
      .describe(
        "The `updatedAt` you loaded. A mismatch is 409 BILLING_ADDRESS_CHANGED.",
      ),
  });

export type UpdateConstructionOrganizationBillingAddressRequestModel = z.input<
  typeof UpdateConstructionOrganizationBillingAddressRequestModel
>;

export const ConstructionOrganizationBillingAddressParamsModel = z.object({
  id: z.uuid(),
});

export const ConstructionOrganizationBillingAddressResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  address: z.string(),
  stateCode: z.string(),
  stateName: z.string(),
  gstin: z.string().nullable(),
  isDefault: z
    .boolean()
    .describe("Purchase Orders start with this address. Exactly one is."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type ConstructionOrganizationBillingAddressResponseModel = z.infer<
  typeof ConstructionOrganizationBillingAddressResponseModel
>;

/** Every live address (a Company has a handful), the default first, then by name. */
export const ListConstructionOrganizationBillingAddressesResponseModel =
  z.object({
    items: z.array(ConstructionOrganizationBillingAddressResponseModel),
    total: z.number().int(),
  });

export type ListConstructionOrganizationBillingAddressesResponseModel = z.infer<
  typeof ListConstructionOrganizationBillingAddressesResponseModel
>;

export function mapBillingAddress(
  address: BillingAddress,
): ConstructionOrganizationBillingAddressResponseModel {
  return {
    id: address.id,
    name: address.name,
    address: address.address,
    stateCode: address.stateCode,
    stateName: gstStateName(address.stateCode) ?? address.stateCode,
    gstin: address.gstin,
    isDefault: address.isDefault,
    createdAt: address.createdAt.toISOString(),
    updatedAt: address.updatedAt.toISOString(),
  };
}
