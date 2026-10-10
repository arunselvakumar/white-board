import {
  addDays,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

/** The Project Dashboard's duration filter (CM-412); default 12 months. */
export const DURATION_PRESETS = [
  { value: "last_30_days", label: "Last 30 days" },
  { value: "last_3_months", label: "Last 3 months" },
  { value: "last_6_months", label: "Last 6 months" },
  { value: "last_12_months", label: "Last 12 months" },
  { value: "this_financial_year", label: "This financial year" },
  { value: "custom", label: "Custom range" },
] as const;

export type DurationPreset = (typeof DURATION_PRESETS)[number]["value"];

export type Duration = {
  preset: DurationPreset;
  from: CalendarDate;
  to: CalendarDate;
};

/** The longest duration the attendance series can cover. */
export const DURATION_MAX_DAYS = 366;

/** Today in the browser's calendar, YYYY-MM-DD. */
export function browserToday(now = new Date()): CalendarDate {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The same day `months` earlier, clamped to the month's last day. */
function monthsBefore(date: CalendarDate, months: number): CalendarDate {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 - months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return target.toISOString().slice(0, 10);
}

/**
 * The days a preset covers, ending today: "Last 3 months" is the day after
 * the same date three months ago through today; the financial year starts
 * on 1 April.
 */
export function presetDuration(
  preset: Exclude<DurationPreset, "custom">,
  today: CalendarDate,
): Duration {
  const months = (count: number) => addDays(monthsBefore(today, count), 1);
  const from = (() => {
    switch (preset) {
      case "last_30_days":
        return addDays(today, -29);
      case "last_3_months":
        return months(3);
      case "last_6_months":
        return months(6);
      case "last_12_months":
        return months(12);
      case "this_financial_year": {
        const year = Number(today.slice(0, 4));
        const start = `${String(year)}-04-01`;
        return today >= start ? start : `${String(year - 1)}-04-01`;
      }
    }
  })();
  return { preset, from, to: today };
}

/** Why a custom range cannot be shown, or null when it can. */
export function durationProblem(duration: Duration): string | null {
  if (duration.from > duration.to)
    return "Choose a start date on or before the end date.";
  if (daysBetween(duration.from, duration.to) + 1 > DURATION_MAX_DAYS)
    return "Choose at most a year.";
  return null;
}
