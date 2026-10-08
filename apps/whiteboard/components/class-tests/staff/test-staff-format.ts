// Wording and small helpers for the staff Test screens (ADR-0037).

import { formatMarks } from "@/src/queries/class-tests";

export {
  dayDate,
  errorCode,
  errorMessage,
  postedByLabel,
  timestampLabel,
} from "@/components/class-work/staff/class-work-format";

/** "Single-student test · Asha Menon". */
export function singleStudentLabel(name: string): string {
  return `Single-student test · ${name}`;
}

export const SINGLE_STUDENT_NUMBERS_NOTE =
  "Single-student Tests are left out of Batch numbers.";

/** "37.5" or "—" when nobody was scored. */
export function marksOrDash(marks: number | null): string {
  return marks == null ? "—" : formatMarks(marks);
}

/** Whether a Student was in the Batch on `date` (the day they left counts). */
export function coversDate(
  span: { start: string; end: string | null },
  date: string,
): boolean {
  return span.start <= date && (span.end == null || span.end >= date);
}

const MARKS_PATTERN = /^\d+(\.\d+)?$/;

/**
 * Checks a typed mark. Returns the number, or the message the server would
 * give for the same input.
 */
export function parseMarks(
  text: string,
  maxMarks: number,
  name: string,
): { marks: number } | { error: string } {
  const value = text.trim();
  if (value === "") return { error: `Enter marks for ${name}.` };
  if (!MARKS_PATTERN.test(value))
    return {
      error: `Marks for ${name} must be a number, like 37 or 37.5.`,
    };
  const marks = Number(value);
  if (marks < 0 || marks > maxMarks)
    return {
      error: `Marks for ${name} must be from 0 to ${String(maxMarks)}.`,
    };
  if (!Number.isInteger(marks * 2))
    return {
      error: `Marks for ${name} must be whole or half marks, like 37 or 37.5.`,
    };
  return { marks };
}

/** "Asha, Ravi, and 3 more". */
export function nameList(names: readonly string[], limit = 5): string {
  const shown = names.slice(0, limit);
  const more = names.length - shown.length;
  return more > 0
    ? `${shown.join(", ")} and ${String(more)} more`
    : shown.join(", ");
}
