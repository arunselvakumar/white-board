// Words and dates the Teacher and Owner see for Absence Notices and the
// Notifications about them (ADR-0041). Dates are the Batch's local dates.

import type {
  AbsenceGiverRole,
  AbsenceReason,
  ExpectedAbsenceClassView,
} from "@/src/training-institute/application/absence-notice-views";
import { ABSENCE_REASON_LABELS } from "@/src/training-institute/domain/absence-notice";
import type { ClassSlotTime } from "@/src/training-institute/domain/class-schedule";

import { addDays, dateKeyInZone } from "./calendar-dates";

function utcDate(key: string): Date {
  return new Date(`${key}T00:00:00.000Z`);
}

function parts(key: string, options: Intl.DateTimeFormatOptions) {
  const found = new Intl.DateTimeFormat("en-IN", {
    timeZone: "UTC",
    ...options,
  }).formatToParts(utcDate(key));
  return (type: Intl.DateTimeFormatPartTypes) =>
    found.find((part) => part.type === type)?.value ?? "";
}

/** "Thu 16 Oct" for a YYYY-MM-DD Batch-local date. */
export function classDayLabel(key: string): string {
  const get = parts(key, { weekday: "short", day: "numeric", month: "short" });
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

/** "Thursday 16 Oct" for a YYYY-MM-DD Batch-local date. */
function longDayLabel(key: string): string {
  const get = parts(key, { weekday: "long", day: "numeric", month: "short" });
  return `${get("weekday")} ${get("day")} ${get("month")}`;
}

function clock(hhmm: string): { time: string; meridiem: "am" | "pm" } {
  const [hourText = "0", minuteText = "0"] = hhmm.split(":");
  const hour = Number(hourText);
  return {
    time: `${String(hour % 12 || 12)}:${minuteText.padStart(2, "0")}`,
    meridiem: hour < 12 ? "am" : "pm",
  };
}

/** "5:00–6:00 pm", or "11:30 am–12:30 pm" across noon. */
export function timeRangeLabel(startTime: string, endTime: string): string {
  const start = clock(startTime);
  const end = clock(endTime);
  return start.meridiem === end.meridiem
    ? `${start.time}–${end.time} ${end.meridiem}`
    : `${start.time} ${start.meridiem}–${end.time} ${end.meridiem}`;
}

/** "Thu 16 Oct, 5:00–6:00 pm" */
export function classSlotLabel(slot: ClassSlotTime): string {
  return `${classDayLabel(slot.date)}, ${timeRangeLabel(slot.startTime, slot.endTime)}`;
}

export function reasonLabel(reason: AbsenceReason): string {
  return ABSENCE_REASON_LABELS[reason];
}

const GIVER_ROLE: Record<AbsenceGiverRole, string> = {
  student: "Student",
  parent: "Parent",
};

/** "Parent (Ramesh Rao)": who gave, or withdrew, the notice. */
export function giverLabel(by: { role: AbsenceGiverRole; name: string }) {
  const name = by.name.trim();
  return name.length === 0
    ? GIVER_ROLE[by.role]
    : `${GIVER_ROLE[by.role]} (${name})`;
}

/** "12 Oct, 3:45 pm" for a timestamp, in the Batch's timezone. */
export function timestampLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(new Date(iso));
}

export function classCountLabel(count: number): string {
  return count === 1 ? "1 Class" : `${String(count)} Classes`;
}

/** "Today", "Tomorrow", or "Thursday 16 Oct". */
export function dayHeading(date: string, today: string): string {
  if (date === today) return "Today";
  if (date === addDays(today, 1)) return "Tomorrow";
  return longDayLabel(date);
}

export type ExpectedAbsenceDay = {
  date: string;
  heading: string;
  /** "16 Oct" under Today and Tomorrow, else null. */
  subheading: string | null;
  classes: ExpectedAbsenceClassView[];
};

/**
 * The Classes grouped by local date, in the order the API gives them (date
 * and time). Today is worked out in each day's Batch timezone.
 */
export function expectedAbsenceDays(
  classes: readonly ExpectedAbsenceClassView[],
  now: Date,
): ExpectedAbsenceDay[] {
  const days: ExpectedAbsenceDay[] = [];
  for (const item of classes) {
    const last = days.at(-1);
    if (last?.date === item.date) {
      last.classes.push(item);
      continue;
    }
    const today = dateKeyInZone(now, item.timezone);
    const heading = dayHeading(item.date, today);
    const relative = heading === "Today" || heading === "Tomorrow";
    days.push({
      date: item.date,
      heading,
      subheading: relative ? classDayLabel(item.date) : null,
      classes: [item],
    });
  }
  return days;
}
