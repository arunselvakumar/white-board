import type { CalendarDate } from "@/src/shared-kernel/calendar-date";

import { invalidField } from "./marketing-errors";

/** A monthly Visit target: a whole number of Visits, or none. */
export const VISIT_TARGET_MAX = 1000;

export function visitTarget(raw: number | null | undefined): number | null {
  if (raw == null) return null;
  if (!Number.isInteger(raw) || raw < 0 || raw > VISIT_TARGET_MAX)
    throw invalidField(
      "VISIT_TARGET_INVALID",
      `Enter a whole number of Visits from 0 to ${String(VISIT_TARGET_MAX)}, or leave it empty.`,
      "target",
    );
  return raw;
}

/** `YYYY-MM` of a calendar date. */
export function monthOf(date: CalendarDate): string {
  return date.slice(0, 7);
}

/** The first and the day after the last of a `YYYY-MM` month. */
export function monthBounds(month: string): {
  first: CalendarDate;
  next: CalendarDate;
} {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const next =
    number === 12
      ? `${String(year + 1)}-01`
      : `${String(year)}-${String(number + 1).padStart(2, "0")}`;
  return { first: `${month}-01`, next: `${next}-01` };
}

/**
 * The target for a month (ADR CM-0040 §4): the latest row whose month is on
 * or before it; none before the first row.
 */
export function targetFor(
  rows: readonly { effectiveMonth: string; target: number | null }[],
  month: string,
): number | null {
  let found: { effectiveMonth: string; target: number | null } | null = null;
  for (const row of rows)
    if (
      row.effectiveMonth <= month &&
      (found == null || row.effectiveMonth > found.effectiveMonth)
    )
      found = row;
  return found?.target ?? null;
}

/**
 * Needs reassigning (ADR CM-0040 §4): a company or open Follow-up whose
 * person is no longer an active Marketing Person (deactivated, removed, or
 * moved to a Role without Visits).
 */
export function needsReassigning(
  memberId: string | null,
  activePeople: ReadonlySet<string>,
): boolean {
  return memberId != null && !activePeople.has(memberId);
}
