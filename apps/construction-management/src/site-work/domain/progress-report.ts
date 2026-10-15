import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * Progress Reports: Daily Progress Reports (CM-606, ADR CM-0016 §15) and
 * Task Progress Reports (CM-805). The report itself is a reporting job;
 * site work owns the DPR's number (one per Project per date,
 * `DPR/26-27/00001`) and the rules for asking for either.
 */

/** The numbering module (CM-114, CM-0016 §4). */
export const PROGRESS_REPORT_SEQUENCE = "daily_progress_report" as const;

/** The Permission Matrix menu: C generates, R lists and downloads, D deletes. */
export const PROGRESS_REPORT_MENU = "site_work.progress_reports" as const;

/** Hire cost prints only with Financial on this menu (CM-0016 §15). */
export const HIRE_COST_MENU = "site_work.equipment_usage" as const;

/**
 * The report types on Create new: the Daily Progress Report (CM-606) and
 * the Task Progress Report (CM-805, ADR CM-0019 §14).
 */
export const PROGRESS_REPORT_TYPES = [
  { key: "daily_progress_report", label: "Daily Progress Report" },
  { key: "task_progress_report", label: "Task Progress Report" },
] as const;

export type ProgressReportType = (typeof PROGRESS_REPORT_TYPES)[number]["key"];

/** A Task Progress Report covers at most a year, like every report (CM-217). */
export const TASK_PROGRESS_MAX_DAYS = 366;

/**
 * A Task Progress Report's period (CM-805): both dates, From on or before
 * To, To not after the Company's today (progress cannot be recorded
 * ahead), at most a year.
 */
export function taskProgressPeriod(
  input: { from?: string | null; to?: string | null },
  today: CalendarDate,
): { from: CalendarDate; to: CalendarDate } {
  const invalid = (field: "from" | "to") =>
    new DomainError(
      "PROGRESS_REPORT_PERIOD_INVALID",
      field === "from" ? "Choose the first day." : "Choose the last day.",
      { details: { field } },
    );
  if (input.from == null || input.from === "") throw invalid("from");
  if (input.to == null || input.to === "") throw invalid("to");
  const from = assertCalendarDate(input.from, "PROGRESS_REPORT_PERIOD_INVALID");
  const to = assertCalendarDate(input.to, "PROGRESS_REPORT_PERIOD_INVALID");
  if (to < from)
    throw new DomainError(
      "PROGRESS_REPORT_PERIOD_INVALID",
      "The period must end on or after the day it starts.",
      { details: { field: "to" } },
    );
  if (to > today)
    throw new DomainError(
      "PROGRESS_REPORT_DATE_IN_FUTURE",
      "Choose today or an earlier date.",
      { details: { field: "to" } },
    );
  if (daysBetween(from, to) + 1 > TASK_PROGRESS_MAX_DAYS)
    throw new DomainError(
      "PROGRESS_REPORT_PERIOD_TOO_LONG",
      `A Task Progress Report covers at most ${String(TASK_PROGRESS_MAX_DAYS)} days.`,
      { details: { field: "from" } },
    );
  return { from, to };
}

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
