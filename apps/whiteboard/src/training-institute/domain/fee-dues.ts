import { addCalendarDays } from "./class-schedule";
import type { FeePlanDueDate } from "./fee-plan";

/** "Due soon" covers a due date from today up to this many days ahead. */
export const DUE_SOON_DAYS = 3;

/**
 * Whether the Fee Plan's due-date amounts add up to its amount after
 * concession. Unclear dates are shown as a guide only (ADR-0039 §2).
 */
export type DueDatesClarity = "clear" | "unclear";

export type FeeDuesStanding = {
  remainingPaise: number;
  clarity: DueDatesClarity;
  /** Due before today and not covered by what has been paid. */
  overdue: boolean;
  /** A due date from today to DUE_SOON_DAYS ahead still has an unpaid part. */
  dueSoon: boolean;
  /** Unpaid amount of the due dates before today. */
  overduePaise: number;
  /** The oldest due date before today with an unpaid part. */
  oldestUnpaidDueOn: string | null;
  /** The first due date from today on with an unpaid part. */
  nextUnpaidDueOn: string | null;
};

/**
 * Reads an Enrollment's dues by counting what has been paid against the Fee
 * Plan's due dates, earliest first (ADR-0039 §1). Nothing is stored: Fee
 * Payments stay unmatched to instalments.
 */
export function assessFeeDues(input: {
  netAmountPaise: number;
  paidPaise: number;
  dueDates: readonly FeePlanDueDate[];
  /** YYYY-MM-DD in the Batch's timezone. */
  today: string;
}): FeeDuesStanding {
  const remainingPaise = Math.max(0, input.netAmountPaise - input.paidPaise);
  const scheduled = input.dueDates.reduce(
    (sum, item) => sum + item.amountPaise,
    0,
  );
  const clarity: DueDatesClarity =
    scheduled === input.netAmountPaise ? "clear" : "unclear";
  const standing: FeeDuesStanding = {
    remainingPaise,
    clarity,
    overdue: false,
    dueSoon: false,
    overduePaise: 0,
    oldestUnpaidDueOn: null,
    nextUnpaidDueOn: null,
  };
  if (clarity === "unclear" || remainingPaise === 0) return standing;

  const soonUntil = addCalendarDays(input.today, DUE_SOON_DAYS);
  let credit = input.paidPaise;
  const inDateOrder = [...input.dueDates].sort((a, b) =>
    a.dueOn.localeCompare(b.dueOn),
  );
  for (const item of inDateOrder) {
    const covered = Math.min(credit, item.amountPaise);
    credit -= covered;
    const unpaid = item.amountPaise - covered;
    if (unpaid === 0) continue;
    if (item.dueOn < input.today) {
      standing.overdue = true;
      standing.overduePaise += unpaid;
      standing.oldestUnpaidDueOn ??= item.dueOn;
      continue;
    }
    standing.nextUnpaidDueOn ??= item.dueOn;
    if (item.dueOn <= soonUntil) standing.dueSoon = true;
  }
  return standing;
}
