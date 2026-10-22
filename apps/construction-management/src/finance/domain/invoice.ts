import {
  addDays,
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import {
  assertAmount,
  MAX_AMOUNT,
  type NewPartyEntry,
  type PartyType,
} from "./ledger";
import {
  optionalText,
  PARTY_TEXT_LIMITS,
  placeColumns,
  type PartyPlace,
} from "./party";

/**
 * Party invoices (ADR CM-0017 §7, §11, §13): a bill from a Contractor,
 * Supplier or Other Party (payable, + on the party's balance) or a sales
 * invoice to an Other Party (receivable, −). The status is derived from
 * the live allocations and an approved settlement; nothing is stored.
 */

export type InvoiceDirection = "payable" | "receivable";
/**
 * `manual`: typed in finance; `goods_receipt`: from a GRN (CM-0017 §13);
 * `ra_bill`: from an approved Contractor Bill (CM-1106, CM-0023 §7),
 * read-only here.
 */
export type InvoiceOrigin = "manual" | "goods_receipt" | "ra_bill";

export const INVOICE_STATUSES = [
  "open",
  "partly_paid",
  "paid",
  "settled",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/** ₹1: an invoice differing from its GRNs' value by more shows a variance (§13). */
export const INVOICE_VARIANCE_PAISE = 100n;

export type InvoiceFieldsInput = {
  invoiceNumber?: string | null;
  invoiceDate: string;
  dueDate?: string | null;
  departmentId?: string | null;
  taxableAmount?: bigint | null;
  gstAmount?: bigint | null;
  amount: bigint;
  remarks?: string | null;
};

export type InvoiceFields = {
  /** Null for a sales invoice until it is numbered. */
  invoiceNumber: string | null;
  invoiceDate: CalendarDate;
  dueDate: CalendarDate | null;
  departmentId: string | null;
  taxableAmount: bigint | null;
  gstAmount: bigint | null;
  amount: bigint;
  remarks: string | null;
};

/**
 * Checks an invoice's own fields. A bill from a party needs its typed
 * number; a sales invoice is numbered by the INV rule. The due date is on
 * or after the invoice date. Taxable value and GST are optional and
 * together at most the amount. Only a Contractor's invoice names a
 * Department.
 */
export function invoiceFields(
  partyType: PartyType,
  direction: InvoiceDirection,
  input: InvoiceFieldsInput,
): InvoiceFields {
  if (direction === "receivable" && partyType !== "other_party")
    throw new DomainError(
      "SALES_INVOICE_ONLY_FOR_OTHER_PARTIES",
      "Only an Other Party can be billed with a sales invoice.",
      { details: { field: "direction" } },
    );
  const invoiceNumber =
    direction === "payable"
      ? optionalText(
          input.invoiceNumber,
          "invoiceNumber",
          PARTY_TEXT_LIMITS.invoiceNumber,
        )
      : null;
  if (direction === "payable" && invoiceNumber == null)
    throw new DomainError(
      "INVOICE_NUMBER_REQUIRED",
      "Enter the party's invoice number.",
      { details: { field: "invoiceNumber" } },
    );
  const invoiceDate = assertCalendarDate(
    input.invoiceDate,
    "INVOICE_DATE_INVALID",
  );
  const dueDate =
    input.dueDate == null || input.dueDate === ""
      ? null
      : assertCalendarDate(input.dueDate, "DUE_DATE_INVALID");
  if (dueDate != null && dueDate < invoiceDate)
    throw new DomainError(
      "DUE_DATE_BEFORE_INVOICE",
      "The due date cannot be before the invoice date.",
      { details: { field: "dueDate" } },
    );
  assertAmount(input.amount);
  const taxableAmount = input.taxableAmount ?? null;
  const gstAmount = input.gstAmount ?? null;
  for (const [field, value] of [
    ["taxableAmount", taxableAmount],
    ["gstAmount", gstAmount],
  ] as const)
    if (value != null && (value < 0n || value > MAX_AMOUNT))
      throw new DomainError("AMOUNT_INVALID", "Enter 0 or more.", {
        details: { field },
      });
  if ((taxableAmount ?? 0n) + (gstAmount ?? 0n) > input.amount)
    throw new DomainError(
      "INVOICE_SPLIT_EXCEEDS_AMOUNT",
      "Taxable value and GST together cannot be more than the invoice amount.",
      { details: { field: "gstAmount" } },
    );
  const departmentId = input.departmentId ?? null;
  if (departmentId != null && partyType !== "contractor")
    throw new DomainError(
      "DEPARTMENT_ONLY_FOR_CONTRACTORS",
      "Only a Contractor's invoice names a Department.",
      { details: { field: "departmentId" } },
    );
  return {
    invoiceNumber,
    invoiceDate,
    dueDate,
    departmentId,
    taxableAmount,
    gstAmount,
    amount: input.amount,
    remarks: optionalText(input.remarks, "remarks", PARTY_TEXT_LIMITS.remarks),
  };
}

/** The party entry an invoice posts: + for a bill from the party, − for a sales invoice. */
export function invoiceEntry(invoice: {
  id: string;
  partyType: PartyType;
  partyId: string;
  place: PartyPlace;
  direction: InvoiceDirection;
  invoiceDate: CalendarDate;
  amount: bigint;
}): NewPartyEntry {
  return {
    partyType: invoice.partyType,
    partyId: invoice.partyId,
    ...placeColumns(invoice.place),
    entryDate: invoice.invoiceDate,
    kind: invoice.direction === "payable" ? "invoice" : "sales_invoice",
    amount: invoice.direction === "payable" ? invoice.amount : -invoice.amount,
    invoiceId: invoice.id,
    sourceType: "invoice",
    sourceId: invoice.id,
  };
}

/** What an invoice has absorbed so far. */
export type InvoiceFigures = {
  /** Σ live allocations (paid + TDS for a Contractor). */
  allocated: bigint;
  /** What an approved settlement wrote off. */
  writtenOff: bigint;
};

export type InvoiceState = InvoiceFigures & {
  amount: bigint;
  dueDate: CalendarDate | null;
  settledAt: Date | null;
};

export type InvoiceProgress = {
  balance: bigint;
  status: InvoiceStatus;
  overdue: boolean;
  /** Days past the due date while overdue; 0 otherwise. */
  daysOverdue: number;
};

/**
 * Open (nothing allocated), Partly paid, Paid (balance zero) or Settled (a
 * write-off approved); Overdue when the due date is before `today` and a
 * balance remains (CM-0017 §7).
 */
export function invoiceProgress(
  invoice: InvoiceState,
  today: CalendarDate,
): InvoiceProgress {
  const balance = invoice.amount - invoice.allocated - invoice.writtenOff;
  const status: InvoiceStatus =
    invoice.settledAt != null
      ? "settled"
      : balance <= 0n
        ? "paid"
        : invoice.allocated > 0n
          ? "partly_paid"
          : "open";
  const overdue =
    status !== "settled" &&
    balance > 0n &&
    invoice.dueDate != null &&
    invoice.dueDate < today;
  return {
    balance,
    status,
    overdue,
    daysOverdue:
      overdue && invoice.dueDate != null
        ? daysBetween(invoice.dueDate, today)
        : 0,
  };
}

/** |amount − Σ GRN value| above ₹1 (CM-0017 §13); false without GRNs. */
export function hasVariance(amount: bigint, grnValues: readonly bigint[]) {
  if (grnValues.length === 0) return false;
  const total = grnValues.reduce((sum, value) => sum + value, 0n);
  const difference = amount > total ? amount - total : total - amount;
  return difference > INVOICE_VARIANCE_PAISE;
}

/**
 * An invoice's amount can come down only to what is already allocated to
 * it and written off (409 `INVOICE_BELOW_ALLOCATED`).
 */
export function assertAmountCovers(
  amount: bigint,
  figures: InvoiceFigures,
): void {
  if (amount < figures.allocated + figures.writtenOff)
    throw new DomainError(
      "INVOICE_BELOW_ALLOCATED",
      "Payments already settle more than this amount. Cancel or move them first.",
      {
        kind: "conflict",
        details: { field: "amount", allocated: Number(figures.allocated) },
      },
    );
}

/** The write-off an approved settlement posts: − on a bill from the party, + on a sales invoice. */
export function writeOffEntry(input: {
  settlementId: string;
  invoice: {
    id: string;
    partyType: PartyType;
    partyId: string;
    place: PartyPlace;
    direction: InvoiceDirection;
  };
  balance: bigint;
  date: CalendarDate;
}): NewPartyEntry {
  const { invoice } = input;
  return {
    partyType: invoice.partyType,
    partyId: invoice.partyId,
    ...placeColumns(invoice.place),
    entryDate: input.date,
    kind: "write_off",
    amount: invoice.direction === "payable" ? -input.balance : input.balance,
    invoiceId: invoice.id,
    sourceType: "settlement",
    sourceId: input.settlementId,
  };
}

/** The due date of a GRN's invoice: invoice date + the PO's payment-terms days. */
export function dueDateFromTerms(
  invoiceDate: CalendarDate,
  paymentTermsDays: number | null,
): CalendarDate | null {
  if (paymentTermsDays == null || paymentTermsDays < 0) return null;
  return addDays(invoiceDate, paymentTermsDays);
}
