import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import type { InvoiceDirection } from "./invoice";
import {
  assertAmount,
  type NewAccountEntry,
  type NewPartyEntry,
  type PartyType,
  type PaymentMode,
} from "./ledger";
import {
  PARTY_TYPE_LABELS,
  placeColumns,
  samePlace,
  type PartyPlace,
} from "./party";

/**
 * Party payments (ADR CM-0017 §6, §7): money paid to a party (out) or
 * received from an Other Party or a Client (in), with no approval. One payment can
 * settle several open invoices of the same party and place; its settled
 * amount is what moved plus TDS, and what is not allocated is an advance.
 */

export type PaymentDirection = "out" | "in";

/**
 * Payment Out to a Contractor, Supplier or Other Party; Payment In from an
 * Other Party or a Client (CM-1107). A Client is never paid: its money
 * comes in against the Client Bills' receivable invoices.
 */
export function assertDirection(
  partyType: PartyType,
  direction: PaymentDirection,
): void {
  if (direction === "out" && partyType === "client")
    throw new DomainError(
      "PAYMENT_OUT_NOT_FOR_CLIENTS",
      "A Client pays the Company: record a Payment In (receipt) from them.",
      { details: { field: "direction" } },
    );
  if (
    direction === "in" &&
    partyType !== "other_party" &&
    partyType !== "client"
  )
    throw new DomainError(
      "PAYMENT_IN_ONLY_FOR_OTHER_PARTIES",
      "Only an Other Party or a Client pays the Company (Payment In).",
      { details: { field: "direction" } },
    );
}

/** An out payment settles bills from the party; an in payment, sales invoices. */
export function directionOfInvoices(
  direction: PaymentDirection,
): InvoiceDirection {
  return direction === "out" ? "payable" : "receivable";
}

export type AllocationInput = { invoiceId: string; amount: bigint };

/** An invoice as allocation checks it (locked `FOR UPDATE` by the caller). */
export type AllocatableInvoice = {
  id: string;
  invoiceNumber: string;
  partyType: PartyType;
  partyId: string;
  place: PartyPlace;
  direction: InvoiceDirection;
  settled: boolean;
  /** amount − allocated − written off, before this payment. */
  balance: bigint;
};

function allocationError(
  code: string,
  message: string,
  index: number,
  kind: "invalid" | "conflict" = "invalid",
): DomainError {
  return new DomainError(code, message, {
    kind,
    details: { field: `allocations.${String(index)}`, index },
  });
}

/**
 * Checks allocations of `available` (the payment's settled amount, or the
 * unallocated part when applying an advance) across invoices: each one the
 * same party, place and direction, not settled, at most its balance, each
 * invoice once; together at most `available` (400
 * `ALLOCATION_EXCEEDS_PAYMENT`). Returns the total allocated.
 */
export function checkAllocations(input: {
  partyType: PartyType;
  partyId: string;
  place: PartyPlace;
  direction: PaymentDirection;
  available: bigint;
  allocations: readonly AllocationInput[];
  invoices: ReadonlyMap<string, AllocatableInvoice>;
}): bigint {
  const seen = new Set<string>();
  let total = 0n;
  const wanted = directionOfInvoices(input.direction);
  input.allocations.forEach((allocation, index) => {
    if (seen.has(allocation.invoiceId))
      throw allocationError(
        "ALLOCATION_DUPLICATE",
        "An invoice appears twice in the allocation.",
        index,
      );
    seen.add(allocation.invoiceId);
    if (allocation.amount <= 0n)
      throw allocationError(
        "AMOUNT_INVALID",
        "Allocate an amount above zero.",
        index,
      );
    const invoice = input.invoices.get(allocation.invoiceId);
    if (invoice == null)
      throw allocationError(
        "INVOICE_NOT_FOUND",
        "An allocated invoice was not found.",
        index,
      );
    if (
      invoice.partyType !== input.partyType ||
      invoice.partyId !== input.partyId
    )
      throw allocationError(
        "ALLOCATION_OTHER_PARTY",
        `Invoice ${invoice.invoiceNumber} belongs to another party.`,
        index,
      );
    if (!samePlace(invoice.place, input.place))
      throw allocationError(
        "ALLOCATION_OTHER_PLACE",
        `Invoice ${invoice.invoiceNumber} is on another ${invoice.place.kind === "store" ? "Store" : "Project"}.`,
        index,
      );
    if (invoice.direction !== wanted)
      throw allocationError(
        "ALLOCATION_WRONG_DIRECTION",
        wanted === "payable"
          ? `Invoice ${invoice.invoiceNumber} is a sales invoice; a Payment Out settles bills from the party.`
          : `Invoice ${invoice.invoiceNumber} is a bill from the party; a Payment In settles sales invoices.`,
        index,
      );
    if (invoice.settled)
      throw allocationError(
        "INVOICE_SETTLED",
        `Invoice ${invoice.invoiceNumber} is settled.`,
        index,
        "conflict",
      );
    if (allocation.amount > invoice.balance)
      throw allocationError(
        "ALLOCATION_EXCEEDS_BALANCE",
        `Invoice ${invoice.invoiceNumber} has only ${rupees(invoice.balance)} left to pay.`,
        index,
      );
    total += allocation.amount;
  });
  if (total > input.available)
    throw new DomainError(
      "ALLOCATION_EXCEEDS_PAYMENT",
      `The allocations come to ${rupees(total)}, more than the ${rupees(input.available)} this payment settles.`,
      { details: { field: "allocations" } },
    );
  return total;
}

function rupees(paise: bigint): string {
  return `₹${new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(paise) / 100)}`;
}

export type PaymentPosting = {
  id: string;
  number: string;
  partyType: PartyType;
  partyId: string;
  partyName: string;
  place: PartyPlace;
  direction: PaymentDirection;
  paymentDate: CalendarDate;
  accountId: string;
  mode: PaymentMode;
  /** Cheque number for Cheque, else the reference. */
  reference: string | null;
  paymentCategoryId: string | null;
  /** Paise moved. */
  amount: bigint;
  /** Paise deducted (Contractors, out only). */
  tdsAmount: bigint;
  /** Paise of income-tax TDS the Client deducted (Client receipts only). */
  clientTdsAmount: bigint;
  /** Paise of GST-TDS (s.51) the Client deducted (Client receipts only). */
  gstTdsAmount: bigint;
  remarks: string | null;
};

/**
 * What a payment settles on its invoices (CM-0017 §7, CM-1107): the money
 * that moved plus the TDS the Company deducted (out), or plus the TDS and
 * GST-TDS the Client deducted (in).
 */
export function settledAmount(payment: {
  amount: bigint;
  tdsAmount: bigint;
  clientTdsAmount: bigint;
  gstTdsAmount: bigint;
}): bigint {
  return (
    payment.amount +
    payment.tdsAmount +
    payment.clientTdsAmount +
    payment.gstTdsAmount
  );
}

/**
 * What a recorded payment posts (CM-0017 §6, §8): on the party, out:
 * `payment` −amount and `tds` −TDS (the party is settled by both); in:
 * `receipt` +amount, and from a Client `client_tds` +TDS and `gst_tds`
 * +GST-TDS it deducted (CM-1107), so the Client's due falls by all three.
 * On the account, only the money that moved, with the party and the PAY
 * number on the entry.
 */
export function paymentEntries(payment: PaymentPosting): {
  party: NewPartyEntry[];
  account: NewAccountEntry;
} {
  assertAmount(payment.amount);
  const base = {
    partyType: payment.partyType,
    partyId: payment.partyId,
    ...placeColumns(payment.place),
    entryDate: payment.paymentDate,
    sourceType: "party_payment" as const,
    sourceId: payment.id,
  };
  const party: NewPartyEntry[] =
    payment.direction === "out"
      ? [
          { ...base, kind: "payment" as const, amount: -payment.amount },
          { ...base, kind: "tds" as const, amount: -payment.tdsAmount },
        ].filter((entry) => entry.amount !== 0n)
      : [
          { ...base, kind: "receipt" as const, amount: payment.amount },
          {
            ...base,
            kind: "client_tds" as const,
            amount: payment.clientTdsAmount,
          },
          { ...base, kind: "gst_tds" as const, amount: payment.gstTdsAmount },
        ].filter((entry) => entry.amount !== 0n);
  const account: NewAccountEntry = {
    accountId: payment.accountId,
    ...placeColumns(payment.place),
    entryDate: payment.paymentDate,
    kind: payment.direction === "out" ? "payment" : "receipt",
    amount: payment.direction === "out" ? -payment.amount : payment.amount,
    mode: payment.mode,
    reference: payment.reference,
    paymentCategoryId: payment.paymentCategoryId,
    counterpartyKind: payment.partyType,
    counterpartyId: payment.partyId,
    counterpartyName: payment.partyName,
    documentNumber: payment.number,
    narration: payment.remarks,
    sourceType: "party_payment",
    sourceId: payment.id,
  };
  return { party, account };
}

/** TDS is for payments out to a Contractor only (CM-0017 §8). */
export function assertTdsAllowed(
  partyType: PartyType,
  direction: PaymentDirection,
  tdsAmount: bigint,
): void {
  if (tdsAmount === 0n) return;
  if (partyType !== "contractor" || direction !== "out")
    throw new DomainError(
      "TDS_ONLY_FOR_CONTRACTORS",
      `TDS is deducted on payments to a Contractor, not to a ${PARTY_TYPE_LABELS[partyType]}.`,
      { details: { field: "tdsAmount" } },
    );
  assertAmount(tdsAmount, "tdsAmount");
}

/**
 * TDS and GST-TDS the Client deducted are recorded on receipts from a
 * Client only (400 `CLIENT_TDS_ONLY_FOR_CLIENTS`), and together with the
 * money they are at most ₹100 crore like any amount.
 */
export function assertClientDeductionsAllowed(
  partyType: PartyType,
  direction: PaymentDirection,
  amounts: { clientTdsAmount: bigint; gstTdsAmount: bigint },
): void {
  for (const [field, value] of [
    ["clientTdsAmount", amounts.clientTdsAmount],
    ["gstTdsAmount", amounts.gstTdsAmount],
  ] as const) {
    if (value === 0n) continue;
    if (partyType !== "client" || direction !== "in")
      throw new DomainError(
        "CLIENT_TDS_ONLY_FOR_CLIENTS",
        "TDS and GST-TDS deducted by the payer are recorded on receipts from a Client.",
        { details: { field } },
      );
    assertAmount(value, field);
  }
}

/** The reference the duplicate check and the ledger use for a mode. */
export function paymentReference(
  mode: PaymentMode,
  input: { chequeNumber: string | null; reference: string | null },
): string | null {
  return mode === "cheque" ? input.chequeNumber : input.reference;
}
