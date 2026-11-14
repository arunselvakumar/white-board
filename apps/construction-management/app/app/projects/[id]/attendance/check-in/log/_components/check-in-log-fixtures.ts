import type { CheckInEntry, CheckInLogPage } from "@/src/queries/check-ins";

import {
  CONTEXT,
  DHURESH,
  entry,
  KAVITHA_ENTRIES,
  MURUGAN_IN,
  RAJA,
  RAVI,
  TODAY,
} from "@/app/app/projects/[id]/attendance/check-in/_components/check-in-fixtures";

/** Ravi's Check In at 9:15 am. */
export const RAVI_IN = entry(RAVI, {
  action: "check_in",
  at: "2026-11-14T03:45:00.000Z",
});

/** Raja's gang arriving at 9:00 am; the browser gave no location. */
export const RAJA_IN = entry(RAJA, {
  action: "check_in",
  at: "2026-11-14T03:30:00.000Z",
  location: null,
  fence: null,
  metresOutside: null,
});

/** Dhuresh checked in by mistake at 9:40 am, then voided. */
export const DHURESH_VOIDED = entry(DHURESH, {
  action: "check_in",
  at: "2026-11-14T04:10:00.000Z",
  voided: {
    at: "2026-11-14T04:12:00.000Z",
    by: { id: "member-anugraha", name: "Anugraha Selvan" },
    reason: "Checked in the wrong person",
  },
});

/** Today's entries, newest first. */
export const TODAY_ENTRIES: CheckInEntry[] = [
  ...KAVITHA_ENTRIES,
  MURUGAN_IN,
  DHURESH_VOIDED,
  RAVI_IN,
  RAJA_IN,
].sort((a, b) => b.at.localeCompare(a.at));

export function logPage(
  items: CheckInEntry[] = TODAY_ENTRIES,
  overrides: Partial<CheckInLogPage> = {},
): CheckInLogPage {
  return {
    ...CONTEXT,
    date: TODAY,
    items,
    nextCursor: null,
    prevCursor: null,
    total: items.length,
    ...overrides,
  };
}

/** 15 Aug 2026, more than 90 days back: the photo is gone, the entry stays. */
export const OLD_DAY = "2026-08-15";

export const OLD_ENTRY = entry(RAVI, {
  action: "check_in",
  at: "2026-08-15T03:40:00.000Z",
  date: OLD_DAY,
  hasPhoto: false,
});
