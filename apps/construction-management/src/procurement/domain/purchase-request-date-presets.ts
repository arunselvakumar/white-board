import { addDays, type CalendarDate } from "@/src/shared-kernel/calendar-date";

/**
 * The Date filter of the Purchase Request and Purchase Order lists
 * (`modules/06`): This Week (Monday to today), Last Week (Monday to
 * Sunday), Last 15 Days (today and the 14 before), This Month, Last Month,
 * or a Custom range. Resolved in the browser to `from` / `to`.
 */
export const DATE_PRESETS = [
  { key: "this_week", label: "This Week" },
  { key: "last_week", label: "Last Week" },
  { key: "last_15_days", label: "Last 15 Days" },
  { key: "this_month", label: "This Month" },
  { key: "last_month", label: "Last Month" },
  { key: "custom", label: "Custom" },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["key"];

/** 0 = Monday … 6 = Sunday. */
function weekday(date: CalendarDate): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return (day + 6) % 7;
}

function monthStart(date: CalendarDate): CalendarDate {
  return `${date.slice(0, 8)}01`;
}

/** The range a preset covers on `today`; null for Custom. */
export function datePresetRange(
  preset: DatePreset,
  today: CalendarDate,
): { from: CalendarDate; to: CalendarDate } | null {
  switch (preset) {
    case "this_week":
      return { from: addDays(today, -weekday(today)), to: today };
    case "last_week": {
      const monday = addDays(today, -weekday(today) - 7);
      return { from: monday, to: addDays(monday, 6) };
    }
    case "last_15_days":
      return { from: addDays(today, -14), to: today };
    case "this_month":
      return { from: monthStart(today), to: today };
    case "last_month": {
      const end = addDays(monthStart(today), -1);
      return { from: monthStart(end), to: end };
    }
    case "custom":
      return null;
  }
}
