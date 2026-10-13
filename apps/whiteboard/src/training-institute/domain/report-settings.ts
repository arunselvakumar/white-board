import { DomainError } from "./errors";

/** The Owner's Report settings (Reports PRD §6.11), one per Workspace. */
export type ReportSettings = {
  /** Below this attendance % a Student is flagged (R3). */
  thresholdPercent: number;
  /** This many absences in a row flags a Student (R3, List B). */
  absentInARow: number;
  /** Fewer counted Classes than this is "Too early to judge". */
  minimumClasses: number;
  /** 1–12; the academic year starts on the 1st of this month. */
  academicYearStartMonth: number;
};

export const DEFAULT_REPORT_SETTINGS: ReportSettings = {
  thresholdPercent: 75,
  absentInARow: 3,
  minimumClasses: 4,
  academicYearStartMonth: 6,
};

function wholeNumber(
  value: number,
  min: number,
  max: number,
  message: string,
): number {
  if (!Number.isInteger(value) || value < min || value > max)
    throw new DomainError("REPORT_SETTINGS_INVALID", message);
  return value;
}

/** Checks every setting; changes apply to every report straight away. */
export function reportSettings(input: ReportSettings): ReportSettings {
  return {
    thresholdPercent: wholeNumber(
      input.thresholdPercent,
      1,
      100,
      "The low-attendance threshold must be a whole % from 1 to 100.",
    ),
    absentInARow: wholeNumber(
      input.absentInARow,
      2,
      30,
      "Absent in a row must be a whole number from 2 to 30.",
    ),
    minimumClasses: wholeNumber(
      input.minimumClasses,
      1,
      60,
      "Minimum counted Classes must be a whole number from 1 to 60.",
    ),
    academicYearStartMonth: wholeNumber(
      input.academicYearStartMonth,
      1,
      12,
      "Choose the month the academic year starts.",
    ),
  };
}

/** The R18 remark limit: one short remark per author, Student and month. */
export const MONTHLY_REMARK_MAX_LENGTH = 300;

export function monthlyRemarkText(raw: string): string | null {
  const text = raw.trim();
  if (text.length > MONTHLY_REMARK_MAX_LENGTH)
    throw new DomainError(
      "REPORT_REMARK_TOO_LONG",
      `A remark can be at most ${String(MONTHLY_REMARK_MAX_LENGTH)} characters.`,
    );
  return text.length === 0 ? null : text;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export function reportMonth(raw: string): string {
  if (!MONTH_RE.test(raw))
    throw new DomainError("REPORT_MONTH_INVALID", "Month must be YYYY-MM.");
  return raw;
}
