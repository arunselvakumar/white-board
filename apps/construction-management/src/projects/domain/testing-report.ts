import {
  assertCalendarDate,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * Testing Reports (CM-409, ADR CM-0013 §9): materials tested on a Project
 * (Rcc cube, Steel, Cement, Bricks to start with) and the lab reports for
 * each, one file per report.
 */

export const TESTING_ITEM_NAME_MAX = 80;
export const TESTING_REPORT_NAME_MAX = 120;
export const TESTING_REPORT_REMARK_MAX = 500;

/** A material tested on the Project. */
export type TestingItem = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  /** One of the four items every Project starts with. */
  isSeed: boolean;
  createdAt: Date;
  updatedAt: Date;
};

/** A lab report: name, report date, remark and one PDF or image. */
export type TestingReport = {
  id: string;
  workspaceId: string;
  projectId: string;
  itemId: string;
  name: string;
  /** Calendar date in the Company time zone (back-dated policy `material_testing_report`). */
  reportDate: CalendarDate;
  remark: string | null;
  fileKey: string;
  fileName: string;
  contentType: string;
  bytes: number;
  thumbKey: string | null;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
};

/** What a person types for a report; checked by `testingReportDetails`. */
export type TestingReportDetailsInput = {
  name: string;
  reportDate: string;
  remark?: string | null;
};

export type TestingReportDetails = {
  name: string;
  reportDate: CalendarDate;
  remark: string | null;
};

function collapse(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}

/** A testing item's name: required, at most 80 characters. */
export function testingItemName(raw: string): string {
  const name = collapse(raw);
  if (name.length === 0)
    throw new DomainError(
      "TESTING_ITEM_NAME_REQUIRED",
      "Enter the testing material name.",
    );
  if (name.length > TESTING_ITEM_NAME_MAX)
    throw new DomainError(
      "TESTING_ITEM_NAME_TOO_LONG",
      `The testing material name can be at most ${String(TESTING_ITEM_NAME_MAX)} characters.`,
    );
  return name;
}

/**
 * A report's name (required, at most 120), report date (a real date) and
 * remark (optional, at most 500; blank is none).
 */
export function testingReportDetails(
  input: TestingReportDetailsInput,
): TestingReportDetails {
  const name = collapse(input.name);
  if (name.length === 0)
    throw new DomainError(
      "TESTING_REPORT_NAME_REQUIRED",
      "Enter the report name.",
    );
  if (name.length > TESTING_REPORT_NAME_MAX)
    throw new DomainError(
      "TESTING_REPORT_NAME_TOO_LONG",
      `The report name can be at most ${String(TESTING_REPORT_NAME_MAX)} characters.`,
    );
  const reportDate = assertCalendarDate(
    input.reportDate,
    "TESTING_REPORT_DATE_INVALID",
  );
  const remark = input.remark?.trim() ?? "";
  if (remark.length > TESTING_REPORT_REMARK_MAX)
    throw new DomainError(
      "TESTING_REPORT_REMARK_TOO_LONG",
      `The remark can be at most ${String(TESTING_REPORT_REMARK_MAX)} characters.`,
    );
  return { name, reportDate, remark: remark.length === 0 ? null : remark };
}
