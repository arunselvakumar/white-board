import {
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import type { PartyType } from "./ledger";

/**
 * What is still owed on invoices (CM-709, ADR CM-0017 §7, §16): an
 * invoice's balance, Overdue, the ageing buckets of Due Payments, and the
 * per-party sums the Project Dashboard, Central Payment and the Due
 * Payments report share. Money is paise as `bigint`.
 */

export type InvoiceDirection = "payable" | "receivable";

/** One live invoice with what has settled it, as on some date. */
export type DueInvoice = {
  id: string;
  partyType: PartyType;
  partyId: string;
  projectId: string | null;
  direction: InvoiceDirection;
  invoiceDate: CalendarDate;
  /** Null: due on the invoice date. */
  dueDate: CalendarDate | null;
  amount: bigint;
  /** Σ live allocations (money paid + TDS). */
  allocated: bigint;
  /** What the approved settlement's write-off entries took off (positive). */
  writtenOff: bigint;
  /** `settled_at` is set: an approved settlement closed it. */
  settled: boolean;
};

/**
 * What is left of an invoice: amount − allocated − written off, never
 * below zero. A settled invoice with no write-off entry (a settlement
 * recorded without one) has nothing left.
 */
export function invoiceBalance(invoice: DueInvoice): bigint {
  if (invoice.settled && invoice.writtenOff === 0n) return 0n;
  const left = invoice.amount - invoice.allocated - invoice.writtenOff;
  return left > 0n ? left : 0n;
}

/** What the settlement took off: the write-off, or the rest when settled without one. */
export function invoiceWrittenOff(invoice: DueInvoice): bigint {
  if (invoice.settled && invoice.writtenOff === 0n) {
    const rest = invoice.amount - invoice.allocated;
    return rest > 0n ? rest : 0n;
  }
  return invoice.writtenOff;
}

/**
 * Overdue: a due date before `today`, not settled, and something left —
 * the party screens' rule (`invoiceProgress`). An invoice without a due
 * date is never overdue.
 */
export function isOverdue(invoice: DueInvoice, today: CalendarDate): boolean {
  return (
    invoice.dueDate != null &&
    invoice.dueDate < today &&
    !invoice.settled &&
    invoiceBalance(invoice) > 0n
  );
}

/** Ageing by days past the due date (legacy Due Payments, CM-0017 §16). */
export const AGEING_BUCKETS = [
  "not_due",
  "days_0_30",
  "days_31_60",
  "days_61_90",
  "days_90_plus",
] as const;

export type AgeingBucket = (typeof AGEING_BUCKETS)[number];

export const AGEING_LABELS: Record<AgeingBucket, string> = {
  not_due: "Not due",
  days_0_30: "0–30 days",
  days_31_60: "31–60 days",
  days_61_90: "61–90 days",
  days_90_plus: "90+ days",
};

/**
 * The bucket of an invoice on `asOn`: Not due until the due date has
 * passed (due today is not due yet; no due date is never due), then 1–30
 * days past ("0–30"), 31–60, 61–90 and over 90.
 */
export function ageingBucket(
  invoice: Pick<DueInvoice, "dueDate">,
  asOn: CalendarDate,
): AgeingBucket {
  if (invoice.dueDate == null) return "not_due";
  const days = daysBetween(invoice.dueDate, asOn);
  if (days <= 0) return "not_due";
  if (days <= 30) return "days_0_30";
  if (days <= 60) return "days_31_60";
  if (days <= 90) return "days_61_90";
  return "days_90_plus";
}

export type AgeingAmounts = Record<AgeingBucket, bigint>;

function noAgeing(): AgeingAmounts {
  return {
    not_due: 0n,
    days_0_30: 0n,
    days_31_60: 0n,
    days_61_90: 0n,
    days_90_plus: 0n,
  };
}

/** One party's invoices of one direction, summed. */
export type PartyDue = {
  partyType: PartyType;
  partyId: string;
  direction: InvoiceDirection;
  /** Σ invoice amounts. */
  invoiced: bigint;
  /** Σ allocated: money paid (or received) plus TDS. */
  paid: bigint;
  writtenOff: bigint;
  /** Σ balances = invoiced − paid − written off. */
  due: bigint;
  /** Σ balances of overdue invoices. */
  overdue: bigint;
  /** The balances by ageing bucket on the day asked. */
  ageing: AgeingAmounts;
  /** Invoices with a balance left. */
  openInvoices: number;
  projectIds: string[];
};

/**
 * Sums invoices per party and direction on `asOn`, in the order the
 * parties first appear. Every party with an invoice is returned; callers
 * keep those with something due when they list dues.
 */
export function partyDues(
  invoices: readonly DueInvoice[],
  asOn: CalendarDate,
): PartyDue[] {
  const byKey = new Map<string, PartyDue>();
  for (const invoice of invoices) {
    const key = `${invoice.direction}:${invoice.partyType}:${invoice.partyId}`;
    let due = byKey.get(key);
    if (due == null) {
      due = {
        partyType: invoice.partyType,
        partyId: invoice.partyId,
        direction: invoice.direction,
        invoiced: 0n,
        paid: 0n,
        writtenOff: 0n,
        due: 0n,
        overdue: 0n,
        ageing: noAgeing(),
        openInvoices: 0,
        projectIds: [],
      };
      byKey.set(key, due);
    }
    const balance = invoiceBalance(invoice);
    due.invoiced += invoice.amount;
    due.paid += invoice.allocated;
    due.writtenOff += invoiceWrittenOff(invoice);
    due.due += balance;
    if (balance > 0n) {
      due.openInvoices += 1;
      due.ageing[ageingBucket(invoice, asOn)] += balance;
      if (isOverdue(invoice, asOn)) due.overdue += balance;
    }
    if (
      invoice.projectId != null &&
      !due.projectIds.includes(invoice.projectId)
    )
      due.projectIds.push(invoice.projectId);
  }
  return [...byKey.values()];
}

/**
 * The TDS share of an allocation: a payment settles amount + TDS, so each
 * rupee allocated carries TDS in that proportion (half up to the paisa).
 */
export function tdsShare(
  allocated: bigint,
  payment: { amount: bigint; tdsAmount: bigint },
): bigint {
  const settled = payment.amount + payment.tdsAmount;
  if (settled <= 0n || payment.tdsAmount === 0n) return 0n;
  return (allocated * payment.tdsAmount * 2n + settled) / (settled * 2n);
}
