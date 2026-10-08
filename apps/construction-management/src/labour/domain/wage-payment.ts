import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

import type { NewLedgerEntry, PartyType } from "./ledger";

export type PaymentKind = "payment" | "advance";
export type PaymentMode = "cash" | "bank";

export type WagePaymentInput = {
  partyType: PartyType;
  partyId: string;
  projectId: string;
  paymentDate: CalendarDate;
  kind: PaymentKind;
  mode: PaymentMode;
  /** Paise, > 0. */
  amount: number;
  reference?: string | null;
  paidByMemberId?: string | null;
  remarks?: string | null;
};

export type WagePayment = Required<
  Omit<WagePaymentInput, "reference" | "paidByMemberId" | "remarks">
> & {
  reference: string | null;
  paidByMemberId: string | null;
  remarks: string | null;
};

const REFERENCE_MAX = 100;
const REMARKS_MAX = 500;

function text(
  value: string | null | undefined,
  max: number,
  code: string,
  label: string,
): string | null {
  const trimmed = value?.trim() ?? "";
  if (trimmed.length > max)
    throw new DomainError(
      code,
      `${label} is at most ${String(max)} characters.`,
    );
  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Money paid to a labourer or a vendor (CM-215, `modules/08` "Decisions
 * for the build"): against wages earned (`payment`) or ahead of them
 * (`advance`), by cash or bank.
 */
export function wagePayment(input: WagePaymentInput): WagePayment {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0)
    throw new DomainError(
      "PAYMENT_AMOUNT_INVALID",
      "Enter an amount more than zero.",
    );
  return {
    partyType: input.partyType,
    partyId: input.partyId,
    projectId: input.projectId,
    paymentDate: input.paymentDate,
    kind: input.kind,
    mode: input.mode,
    amount: input.amount,
    reference: text(
      input.reference,
      REFERENCE_MAX,
      "PAYMENT_REFERENCE_TOO_LONG",
      "The reference",
    ),
    paidByMemberId: input.paidByMemberId ?? null,
    remarks: text(
      input.remarks,
      REMARKS_MAX,
      "PAYMENT_REMARKS_TOO_LONG",
      "Remarks",
    ),
  };
}

/** The one negative entry a payment posts (ADR CM-0004). */
export function paymentLedgerEntries(
  payment: WagePayment,
  paymentId: string,
): NewLedgerEntry[] {
  return [
    {
      partyType: payment.partyType,
      partyId: payment.partyId,
      projectId: payment.projectId,
      entryDate: payment.paymentDate,
      kind: payment.kind,
      amount: -payment.amount,
      sourceType: "wage_payment",
      sourceId: paymentId,
      reversesEntryId: null,
    },
  ];
}
