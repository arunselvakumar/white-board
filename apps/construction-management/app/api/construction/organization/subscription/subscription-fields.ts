import { z } from "zod";

import { ORDER_KINDS, type Quote } from "@/src/organization/domain/checkout";
import type { BillingAddress } from "@/src/organization/domain/subscription-order";
import { PLAN_GRANTS } from "@/src/shared-kernel/plan";

/** Shared pieces of the subscription Request and Response models (CM-116, CM-117). */
export const planGrantField = z.enum(PLAN_GRANTS);

const quantity = z.number().int().min(0).max(500).optional();

export const addOnQuantitiesField = z
  .object({
    project: quantity,
    team_member: quantity,
    hrms_member: quantity,
    storage_gb: quantity,
  })
  .describe("Add-on units per grant; storage counts 30 GB units.");

export const checkoutChoiceFields = {
  kind: z.enum(ORDER_KINDS),
  planCode: z.string().min(1).max(40).nullish(),
  months: z.number().int().min(1).max(60).nullish(),
  addOns: addOnQuantitiesField.optional(),
};

export const billingAddressField = z.object({
  name: z.string().trim().min(1).max(120),
  address: z.string().trim().min(1).max(500),
  stateCode: z
    .string()
    .regex(/^\d{2}$/)
    .describe("GST state code, the place of supply"),
  gstin: z.string().trim().max(15).nullable(),
});

export function toBillingAddressResponse(
  address: BillingAddress,
): z.infer<typeof billingAddressField> {
  return {
    name: address.name,
    address: address.address,
    stateCode: address.stateCode,
    gstin: address.gstin,
  };
}

const paise = z.number().int();

export const quoteField = z.object({
  kind: z.enum(ORDER_KINDS),
  planCode: z.string(),
  planName: z.string(),
  months: z.number().int().nullable(),
  days: z.number().int().nullable(),
  lines: z.array(
    z.object({
      item: z.union([z.literal("plan"), planGrantField]),
      description: z.string(),
      ratePaise: paise,
      quantity: z.number().int(),
      months: z.number().int().nullable(),
      days: z.number().int().nullable(),
      amountPaise: paise,
    }),
  ),
  subTotalPaise: paise,
  lastPlanDiscountPaise: paise,
  taxableAmountPaise: paise,
  cgstPaise: paise,
  sgstPaise: paise,
  igstPaise: paise,
  totalPaise: paise,
  currency: z.string().length(3),
  startsAt: z.iso.datetime(),
  endsAt: z.iso.datetime(),
});

export function toQuoteResponse(quote: Quote): z.infer<typeof quoteField> {
  return {
    kind: quote.kind,
    planCode: quote.planCode,
    planName: quote.planName,
    months: quote.months,
    days: quote.days,
    lines: quote.lines.map((line) => ({
      item: line.item,
      description: line.description,
      ratePaise: line.rate,
      quantity: line.quantity,
      months: line.months,
      days: line.days,
      amountPaise: line.amount,
    })),
    subTotalPaise: quote.subTotal,
    lastPlanDiscountPaise: quote.lastPlanDiscount,
    taxableAmountPaise: quote.taxableAmount,
    cgstPaise: quote.tax.cgst,
    sgstPaise: quote.tax.sgst,
    igstPaise: quote.tax.igst,
    totalPaise: quote.total,
    currency: quote.currency,
    startsAt: quote.startsAt.toISOString(),
    endsAt: quote.endsAt.toISOString(),
  };
}
