import { addDays, addMonths, type IsoDate } from "./dates";
import { invalid } from "./errors";

/** "YYYY-MM" */
export type Month = string;

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isMonth(value: string): boolean {
  return MONTH.test(value);
}

/** The month a date falls in. */
export function monthOf(date: IsoDate): Month {
  return date.slice(0, 7);
}

/** 400 `MONTH_INVALID` unless `YYYY-MM`. */
export function assertMonth(value: string): Month {
  if (!isMonth(value))
    throw invalid("MONTH_INVALID", "Give the month as YYYY-MM.");
  return value;
}

/** The first and last day of a month. */
export function monthSpan(month: Month): {
  startsOn: IsoDate;
  endsOn: IsoDate;
} {
  const startsOn = `${month}-01`;
  return { startsOn, endsOn: addDays(addMonths(startsOn, 1), -1) };
}

/** Whole per cent of seats taken; 0 with no seats. */
export function occupancyPercent(children: number, capacity: number): number {
  if (capacity <= 0) return 0;
  return Math.round((children / capacity) * 100);
}

/** An Enquiry still being worked: neither admitted nor lost. */
export function isOpenEnquiry(status: string): boolean {
  return status !== "admitted" && status !== "lost";
}

/**
 * Daily Reports over the Children present today: a present Child with no
 * report is not started.
 */
export function dailyReportCounts(
  presentChildIds: readonly string[],
  reports: ReadonlyMap<string, "draft" | "published">,
): { published: number; draft: number; notStarted: number } {
  const counts = { published: 0, draft: 0, notStarted: 0 };
  for (const childId of presentChildIds) {
    const status = reports.get(childId);
    if (status === "published") counts.published += 1;
    else if (status === "draft") counts.draft += 1;
    else counts.notStarted += 1;
  }
  return counts;
}
