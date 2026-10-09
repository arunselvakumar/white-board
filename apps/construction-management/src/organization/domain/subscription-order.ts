import { DomainError } from "@/src/shared-kernel/domain-error";
import { isGstStateCode } from "@/src/shared-kernel/gst-states";
import { isValidGstin } from "@/src/shared-kernel/tax-ids";

import type { Quote } from "./checkout";
import type { PaidOrderTerms } from "./subscription";

/** Buyer details on a subscription order and its tax invoice. */
export type BillingAddress = {
  name: string;
  address: string;
  /** GST state code, the place of supply (`33` Tamil Nadu). */
  stateCode: string;
  gstin: string | null;
};

export function billingAddress(input: {
  name: string;
  address: string;
  stateCode: string;
  gstin?: string | null;
}): BillingAddress {
  const name = input.name.trim();
  const address = input.address.trim();
  const gstinText = input.gstin?.trim().toUpperCase() ?? "";
  const gstin = gstinText === "" ? null : gstinText;
  if (name.length === 0 || name.length > 120)
    throw new DomainError(
      "BILLING_NAME_INVALID",
      "Enter the billing name (at most 120 characters).",
    );
  if (address.length === 0 || address.length > 500)
    throw new DomainError(
      "BILLING_ADDRESS_INVALID",
      "Enter the billing address (at most 500 characters).",
    );
  if (!isGstStateCode(input.stateCode))
    throw new DomainError("BILLING_STATE_INVALID", "Choose the state.");
  if (gstin != null) {
    if (!isValidGstin(gstin))
      throw new DomainError(
        "GSTIN_INVALID",
        "Enter a valid 15-character GSTIN.",
      );
    if (gstin.slice(0, 2) !== input.stateCode)
      throw new DomainError(
        "GSTIN_STATE_MISMATCH",
        "The GSTIN belongs to a different state.",
      );
  }
  return { name, address, stateCode: input.stateCode, gstin };
}

/** Who sells the subscription: printed on the tax invoice. */
export type Seller = {
  name: string;
  address: string;
  stateCode: string;
  gstin: string | null;
  /** SAC of the service on the invoice. */
  sacCode: string;
};

export type OrderStatus = "created" | "paid" | "failed";

/**
 * One checkout (CM-117): the price snapshot, buyer and seller, and the
 * gateway order. Immutable apart from `created → paid | failed`; a paid
 * order is a tax invoice.
 */
export type SubscriptionOrder = {
  id: string;
  workspaceId: string;
  quote: Quote;
  billing: BillingAddress;
  seller: Seller;
  gateway: "razorpay";
  gatewayOrderId: string;
  gatewayPaymentId: string | null;
  status: OrderStatus;
  invoiceNumber: string | null;
  createdBy: string;
  createdAt: Date;
  paidAt: Date | null;
  failedAt: Date | null;
};

export function paidOrderTerms(order: SubscriptionOrder): PaidOrderTerms {
  return {
    kind: order.quote.kind,
    planCode: order.quote.planCode,
    months: order.quote.months,
    addOns: order.quote.addOns,
    subTotal: order.quote.subTotal,
  };
}

/** Indian fiscal year (April–March) of a date in IST, as `26-27`. */
export function fiscalYearOf(date: Date): string {
  const ist = new Date(date.getTime() + 330 * 60 * 1000);
  const year = ist.getUTCFullYear();
  const start = ist.getUTCMonth() >= 3 ? year : year - 1;
  const two = (value: number) => String(value % 100).padStart(2, "0");
  return `${two(start)}-${two(start + 1)}`;
}

/** `CM/26-27/00001`: at most 16 characters, as GST invoice numbers must be. */
export function invoiceNumber(fiscalYear: string, sequence: number): string {
  return `CM/${fiscalYear}/${String(sequence).padStart(5, "0")}`;
}
