import { formatPaise } from "@/components/money/money-input";
import { monthOf, period, weekOf } from "@/src/labour/domain/ledger";
import type { BalancePeriod, StatementLine } from "@/src/queries/balances";
import { addDays } from "@/src/shared-kernel/calendar-date";

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

/** `2026-10-04` → `4 Oct 2026`. */
export function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
}

/** Paise as rupees, or a dash when hidden (no Financial). */
export function money(paise: number | null | undefined): string {
  return paise == null ? "—" : formatPaise(paise);
}

/** The period's first and last day, as the server computes it. */
export function rangeOf(value: BalancePeriod): { from: string; to: string } {
  try {
    return period(value.kind, value.anchor, value.to);
  } catch {
    return { from: value.anchor, to: value.anchor };
  }
}

/** The period before (−1) or after (+1) this one. */
export function shiftPeriod(
  value: BalancePeriod,
  direction: -1 | 1,
): BalancePeriod {
  if (value.kind === "monthly") {
    const month = monthOf(value.anchor);
    return {
      kind: "monthly",
      anchor: direction === -1 ? addDays(month.from, -1) : addDays(month.to, 1),
    };
  }
  if (value.kind === "weekly")
    return {
      kind: "weekly",
      anchor: addDays(weekOf(value.anchor).from, 7 * direction),
    };
  return value;
}

/** `September 2026`, `14 Sep – 20 Sep 2026`, or the custom range. */
export function periodLabel(value: BalancePeriod): string {
  const { from, to } = rangeOf(value);
  if (value.kind === "monthly")
    return new Intl.DateTimeFormat("en-IN", {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${from}T00:00:00Z`));
  return from === to
    ? formatDate(from)
    : `${formatDate(from)} – ${formatDate(to)}`;
}

export const KIND_LABELS: Record<StatementLine["kind"], string> = {
  opening: "Opening balance",
  earned: "Wages earned",
  overtime: "Overtime",
  payment: "Payment",
  advance: "Advance",
};

/** What wrote a statement line, in words. */
export function sourceLabel(line: StatementLine): string {
  if (line.isReversal) {
    if (line.sourceType === "wage_payment") return "Payment cancelled";
    if (line.kind === "opening") return "Opening balance changed";
    return "Attendance changed";
  }
  switch (line.sourceType) {
    case "labour_attendance":
    case "vendor_attendance":
      return line.kind === "overtime" ? "Overtime" : "Attendance";
    case "wage_payment":
      return line.kind === "advance" ? "Advance" : "Payment";
    default:
      return "Opening balance";
  }
}

export const PARTY_NOUNS = {
  labour: { one: "Labour", many: "Labours", title: "Labour" },
  vendor: { one: "Vendor", many: "Vendors", title: "Vendor" },
} as const;
