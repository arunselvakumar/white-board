// Test and result rules (ADR-0037). Pure: no I/O.

import { isCalendarDate } from "./class-schedule";
import { DomainError } from "./errors";

export const TEST_NAME_MAX = 200;
export const TEST_TOPIC_MAX = 1000;
export const TEST_MAX_MARKS_LIMIT = 1000;
export const TEST_REMARK_MAX = 500;
/** Latest published results on Student Home and Parent Home. */
export const HOME_RESULT_COUNT = 5;

export type TestScope = "batch" | "student";
export type TestResultStatus = "scored" | "absent" | "exempt";

export type TestDetails = {
  name: string;
  heldOn: string;
  maxMarks: number;
  passMarks: number | null;
  topic: string | null;
};

export function testDetails(input: {
  name: string;
  heldOn: string;
  maxMarks: number;
  passMarks?: number | null;
  topic?: string | null;
}): TestDetails {
  const name = input.name.trim();
  if (name.length === 0 || name.length > TEST_NAME_MAX)
    throw new DomainError(
      "CLASS_TEST_NAME_INVALID",
      `Test name must be 1 to ${String(TEST_NAME_MAX)} characters.`,
    );
  if (!isCalendarDate(input.heldOn))
    throw new DomainError(
      "CLASS_TEST_DATE_INVALID",
      "Test date is not a date.",
    );
  const { maxMarks } = input;
  if (
    !Number.isInteger(maxMarks) ||
    maxMarks < 1 ||
    maxMarks > TEST_MAX_MARKS_LIMIT
  )
    throw new DomainError(
      "CLASS_TEST_MAX_MARKS_INVALID",
      `Maximum marks must be a whole number from 1 to ${String(TEST_MAX_MARKS_LIMIT)}.`,
    );
  const passMarks = input.passMarks ?? null;
  if (
    passMarks != null &&
    (!Number.isInteger(passMarks) || passMarks < 0 || passMarks > maxMarks)
  )
    throw new DomainError(
      "CLASS_TEST_PASS_MARKS_INVALID",
      `Pass mark must be a whole number from 0 to the maximum (${String(maxMarks)}).`,
    );
  const topic = input.topic?.trim() ?? "";
  if (topic.length > TEST_TOPIC_MAX)
    throw new DomainError(
      "CLASS_TEST_TOPIC_TOO_LONG",
      `Topic must be ${String(TEST_TOPIC_MAX)} characters or fewer.`,
    );
  return {
    name,
    heldOn: input.heldOn,
    maxMarks,
    passMarks,
    topic: topic.length === 0 ? null : topic,
  };
}

/** A Test is dated from the day the Batch was created through today. */
export function assertTestDate(
  heldOn: string,
  range: { firstDate: string; today: string },
): void {
  if (heldOn > range.today)
    throw new DomainError(
      "CLASS_TEST_DATE_IN_FUTURE",
      "A Test can't be dated in the future.",
    );
  if (heldOn < range.firstDate)
    throw new DomainError(
      "CLASS_TEST_DATE_BEFORE_BATCH",
      "A Test can't be dated before the Batch began.",
    );
}

/** The maximum can't go below a mark already entered. */
export function assertMaxCoversMarks(
  maxMarks: number,
  highest: number | null,
): void {
  if (highest != null && highest > maxMarks)
    throw new DomainError(
      "CLASS_TEST_MAX_BELOW_MARKS",
      `Maximum marks can't be below a mark already entered (${formatMarks(highest)}).`,
    );
}

export type TestResult = {
  status: TestResultStatus;
  marks: number | null;
  remark: string | null;
};

/** One Student's result: scored with marks, or absent or exempt without. */
export function testResult(
  input: {
    status: TestResultStatus;
    marks?: number | null;
    remark?: string | null;
  },
  maxMarks: number,
  studentName: string,
): TestResult {
  const remark = input.remark?.trim() ?? "";
  if (remark.length > TEST_REMARK_MAX)
    throw new DomainError(
      "CLASS_TEST_REMARK_TOO_LONG",
      `Remark for ${studentName} must be ${String(TEST_REMARK_MAX)} characters or fewer.`,
    );
  const marks = input.marks ?? null;
  if (input.status !== "scored") {
    if (marks != null)
      throw new DomainError(
        "CLASS_TEST_MARKS_NOT_ALLOWED",
        `${studentName} is marked ${input.status}, so they can't have marks.`,
      );
    return {
      status: input.status,
      marks: null,
      remark: remark.length === 0 ? null : remark,
    };
  }
  if (marks == null || !Number.isFinite(marks))
    throw new DomainError(
      "CLASS_TEST_MARKS_REQUIRED",
      `Enter marks for ${studentName}.`,
    );
  if (marks < 0 || marks > maxMarks)
    throw new DomainError(
      "CLASS_TEST_MARKS_OUT_OF_RANGE",
      `Marks for ${studentName} must be from 0 to ${String(maxMarks)}.`,
    );
  if (!Number.isInteger(marks * 2))
    throw new DomainError(
      "CLASS_TEST_MARKS_STEP",
      `Marks for ${studentName} must be whole or half marks, like 37 or 37.5.`,
    );
  return {
    status: "scored",
    marks,
    remark: remark.length === 0 ? null : remark,
  };
}

export function sameResult(a: TestResult, b: TestResult): boolean {
  return a.status === b.status && a.marks === b.marks && a.remark === b.remark;
}

/** Pass or fail for a scored result when the Test has a pass mark. */
export function passed(
  result: { status: TestResultStatus; marks: number | null },
  passMarks: number | null,
): boolean | null {
  if (passMarks == null || result.status !== "scored" || result.marks == null)
    return null;
  return result.marks >= passMarks;
}

/** 37.5 stays 37.5; 38 shows as 38. */
export function formatMarks(marks: number): string {
  return Number.isInteger(marks) ? String(marks) : marks.toFixed(1);
}

/**
 * A Student's time in a Batch as local dates: from the day the Enrollment
 * began to the day it ended or the Student was dropped (null while it lasts).
 */
export type BatchSpan = { start: string; end: string | null };

/** Whether the Student was in the Batch on `date` (the day they left counts). */
export function wasInBatchOn(
  spans: readonly BatchSpan[],
  date: string,
): boolean {
  return spans.some(
    (span) => span.start <= date && (span.end == null || span.end >= date),
  );
}

/** Every listed Student needs a result before the Test is published. */
export function assertPublishable(
  listed: readonly { name: string; hasResult: boolean }[],
): void {
  if (listed.length === 0)
    throw new DomainError(
      "CLASS_TEST_NOBODY_LISTED",
      "No Students are listed on this Test.",
    );
  const blank = listed.filter((student) => !student.hasResult);
  if (blank.length === 0) return;
  const names = blank.slice(0, 5).map((student) => student.name);
  const more = blank.length - names.length;
  throw new DomainError(
    "CLASS_TEST_RESULTS_INCOMPLETE",
    `Enter a result for ${names.join(", ")}${more > 0 ? ` and ${String(more)} more` : ""} before publishing.`,
  );
}

export type TestStats = {
  /** Scored results. */
  tested: number;
  absent: number;
  exempt: number;
  /** Over scored results, to one decimal place; null when nobody scored. */
  average: number | null;
  highest: number | null;
  lowest: number | null;
};

export function testStats(
  results: readonly { status: TestResultStatus; marks: number | null }[],
): TestStats {
  const marks = results.flatMap((result) =>
    result.status === "scored" && result.marks != null ? [result.marks] : [],
  );
  const total = marks.reduce((sum, value) => sum + value, 0);
  return {
    tested: marks.length,
    absent: results.filter((result) => result.status === "absent").length,
    exempt: results.filter((result) => result.status === "exempt").length,
    average:
      marks.length === 0 ? null : Math.round((total / marks.length) * 10) / 10,
    highest: marks.length === 0 ? null : Math.max(...marks),
    lowest: marks.length === 0 ? null : Math.min(...marks),
  };
}
