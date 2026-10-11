import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * Daily Progress Reports (CM-606, ADR CM-0016 §15). The report itself is a
 * reporting job; site work owns its number (one per Project per date,
 * `DPR/26-27/00001`) and the rules for asking for one.
 */

/** The numbering module (CM-114, CM-0016 §4). */
export const PROGRESS_REPORT_SEQUENCE = "daily_progress_report" as const;

/** The Permission Matrix menu: C generates, R lists and downloads, D deletes. */
export const PROGRESS_REPORT_MENU = "site_work.progress_reports" as const;

/** Hire cost prints only with Financial on this menu (CM-0016 §15). */
export const HIRE_COST_MENU = "site_work.equipment_usage" as const;

/** The report types on Create new; the Task Progress Report waits for M8. */
export const PROGRESS_REPORT_TYPES = [
  { key: "daily_progress_report", label: "Daily Progress Report" },
  {
    key: "task_progress_report",
    label: "Task Progress Report",
    comingWith: "Coming with Tasks (M8)",
  },
] as const;

/**
 * A DPR is for a real date that is not after the Company's today: a report
 * of a day that has not happened would only print empty sections.
 */
export function progressReportDate(
  value: string,
  today: CalendarDate,
): CalendarDate {
  const date = assertCalendarDate(value, "PROGRESS_REPORT_DATE_INVALID");
  if (date > today)
    throw new DomainError(
      "PROGRESS_REPORT_DATE_IN_FUTURE",
      "Choose today or an earlier date.",
      { details: { field: "date" } },
    );
  return date;
}
