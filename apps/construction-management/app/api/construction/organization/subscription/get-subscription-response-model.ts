import { z } from "zod";

import { billingAddressField, planGrantField } from "./subscription-fields";

export const GetConstructionOrganizationSubscriptionResponseModel = z.object({
  planCode: z.string(),
  planName: z.string(),
  status: z.enum(["trial", "active", "expired"]),
  isTrial: z.boolean(),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
  daysLeft: z.number().int(),
  autoRenew: z.boolean(),
  usage: z.array(
    z.object({
      grant: planGrantField,
      used: z.number().describe("Storage in GB to one decimal"),
      limit: z.number().int(),
    }),
  ),
  addOns: z.array(
    z.object({
      grant: planGrantField,
      name: z.string(),
      quantity: z.number().int(),
    }),
  ),
  /** True for the Owner, who alone can buy or change the plan. */
  canManage: z.boolean(),
  owner: z
    .object({
      unusedValuePaise: z
        .number()
        .int()
        .describe("What an upgrade today would credit"),
      lastBillingAddress: billingAddressField.nullable(),
      paymentsConfigured: z.boolean(),
    })
    .nullable()
    .describe("Amounts and billing, for the Owner only; null for a Member"),
});

export type GetConstructionOrganizationSubscriptionResponseModel = z.infer<
  typeof GetConstructionOrganizationSubscriptionResponseModel
>;
