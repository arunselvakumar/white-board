import { addMonths, type IsoDate } from "./dates";
import { conflict, invalid } from "./errors";

export type FeeFrequency =
  "one_time" | "monthly" | "quarterly" | "term" | "annual";

export type FeeStructureLine = {
  feeHeadId: string;
  feeHeadName: string;
  /** One instalment at `frequency`, in paise. */
  amountPaise: number;
  frequency: FeeFrequency;
};

export type PlannedInvoice = {
  feeHeadId: string;
  /** "Tuition — Jun 2026", "Tuition — Term 2", "Admission fee". */
  label: string;
  dueOn: IsoDate;
  amountPaise: number;
};

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Months in one instalment period. */
const PERIOD_MONTHS = { monthly: 1, quarterly: 3, term: 4 } as const;

const PERIOD_NAME = { quarterly: "Quarter", term: "Term" } as const;

function monthLabel(date: IsoDate): string {
  return `${MONTHS[Number(date.slice(5, 7)) - 1]} ${date.slice(0, 4)}`;
}

/**
 * The Invoices an Admission starts with. One-time and annual charges fall due
 * on the admission date. A recurring charge is raised for every period of the
 * Academic Year from the one the Child joins in, in full (no pro-rata; the
 * Centre edits an Invoice when it agrees something else). A period's Invoice
 * is due on its first day, or on the admission date for the period already
 * under way. A Child admitted before the year starts is charged from its
 * first day.
 */
export function planInvoices(input: {
  admittedOn: IsoDate;
  academicYear: { startsOn: IsoDate; endsOn: IsoDate };
  lines: readonly FeeStructureLine[];
}): PlannedInvoice[] {
  const { academicYear, lines } = input;
  const joinsOn =
    input.admittedOn < academicYear.startsOn
      ? academicYear.startsOn
      : input.admittedOn;
  if (joinsOn > academicYear.endsOn)
    throw invalid(
      "ADMISSION_AFTER_ACADEMIC_YEAR",
      "The admission date is after the Academic Year ends.",
    );
  const invoices: PlannedInvoice[] = [];
  for (const line of lines) {
    if (line.amountPaise <= 0) continue;
    const base = { feeHeadId: line.feeHeadId, amountPaise: line.amountPaise };
    if (line.frequency === "one_time" || line.frequency === "annual") {
      invoices.push({ ...base, label: line.feeHeadName, dueOn: joinsOn });
      continue;
    }
    const months = PERIOD_MONTHS[line.frequency];
    for (let index = 0; index < 12 / months; index += 1) {
      const startsOn = addMonths(academicYear.startsOn, index * months);
      const nextStartsOn = addMonths(
        academicYear.startsOn,
        (index + 1) * months,
      );
      if (nextStartsOn <= joinsOn) continue;
      invoices.push({
        ...base,
        label:
          line.frequency === "monthly"
            ? `${line.feeHeadName} — ${monthLabel(startsOn)}`
            : `${line.feeHeadName} — ${PERIOD_NAME[line.frequency]} ${index + 1}`,
        dueOn: startsOn < joinsOn ? joinsOn : startsOn,
      });
    }
  }
  return invoices.sort(
    (a, b) => a.dueOn.localeCompare(b.dueOn) || a.label.localeCompare(b.label),
  );
}

export type InvoiceAmounts = {
  amountPaise: number;
  concessionPaise: number;
  paidPaise: number;
  cancelled: boolean;
};

/** What is still owed on an Invoice. Never negative; zero when cancelled. */
export function invoiceDuePaise(invoice: InvoiceAmounts): number {
  if (invoice.cancelled) return 0;
  return Math.max(
    0,
    invoice.amountPaise - invoice.concessionPaise - invoice.paidPaise,
  );
}

export type InvoiceStatus =
  "paid" | "partly_paid" | "overdue" | "due" | "upcoming" | "cancelled";

/** `upcoming` is not yet due and unpaid; `overdue` is past its due date. */
export function invoiceStatus(
  invoice: InvoiceAmounts & { dueOn: IsoDate },
  today: IsoDate,
): InvoiceStatus {
  if (invoice.cancelled) return "cancelled";
  if (invoiceDuePaise(invoice) === 0) return "paid";
  if (invoice.dueOn < today) return "overdue";
  if (invoice.paidPaise > 0) return "partly_paid";
  return invoice.dueOn === today ? "due" : "upcoming";
}

/** A concession may not exceed what is left after payments already taken. */
export function assertConcession(
  invoice: { amountPaise: number; paidPaise: number },
  concessionPaise: number,
): void {
  if (!Number.isInteger(concessionPaise) || concessionPaise < 0)
    throw invalid("CONCESSION_INVALID", "Enter a concession of ₹0 or more.");
  if (concessionPaise > invoice.amountPaise - invoice.paidPaise)
    throw conflict(
      "CONCESSION_EXCEEDS_DUE",
      "The concession is more than what is left to pay on this Invoice.",
    );
}

export type Allocation = { invoiceId: string; amountPaise: number };

/**
 * Spreads a Fee Payment over a Child's unpaid Invoices, oldest due date
 * first. A payment larger than everything owed is refused: the Centre has no
 * advance or credit balance to hold it in.
 * @param invoices unpaid Invoices in any order
 */
export function allocatePayment(
  amountPaise: number,
  invoices: readonly { id: string; dueOn: IsoDate; duePaise: number }[],
): Allocation[] {
  if (!Number.isInteger(amountPaise) || amountPaise <= 0)
    throw invalid("FEE_PAYMENT_AMOUNT_INVALID", "Enter an amount above ₹0.");
  const open = invoices
    .filter((invoice) => invoice.duePaise > 0)
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn) || a.id.localeCompare(b.id));
  const owed = open.reduce((sum, invoice) => sum + invoice.duePaise, 0);
  if (amountPaise > owed)
    throw conflict("FEE_OVERPAY", "The amount is more than this Child owes.", {
      owedPaise: owed,
    });
  const allocations: Allocation[] = [];
  let left = amountPaise;
  for (const invoice of open) {
    if (left === 0) break;
    const part = Math.min(left, invoice.duePaise);
    allocations.push({ invoiceId: invoice.id, amountPaise: part });
    left -= part;
  }
  return allocations;
}

/** "<centre code>/<academic year>/<5-digit sequence>": "LS/2026-27/00042". */
export function receiptNumber(
  centreCode: string,
  academicYearName: string,
  sequence: number,
): string {
  return `${centreCode}/${academicYearName.replace("–", "-")}/${String(sequence).padStart(5, "0")}`;
}

/**
 * Royalty owed on a month's collections.
 * @param royaltyBps basis points: 1000 is 10%
 */
export function royaltyPaise(
  royaltyBearingCollectionsPaise: number,
  royaltyBps: number,
): number {
  return Math.round((royaltyBearingCollectionsPaise * royaltyBps) / 10_000);
}
