// Study Material, Homework, and Submission rules (ADR-0033). Pure: no I/O.

import { isCalendarDate, localNow } from "./class-schedule";
import { DomainError } from "./errors";

export const CLASS_WORK_TITLE_MAX = 200;
export const STUDY_MATERIAL_NOTE_MAX = 2000;
export const HOMEWORK_INSTRUCTIONS_MAX = 5000;
export const LINK_URL_MAX = 2048;
export const SUBMISSION_NOTE_MAX = 1000;
export const REMARK_MAX = 500;
export const ATTACHMENT_MAX_COUNT = 5;
/** Vercel refuses request bodies over 4.5 MB, so files stay under 4 MB. */
export const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
export const ATTACHMENT_NAME_MAX = 200;
/** Uploads not attached to anything within a day are purged. */
export const UNATTACHED_UPLOAD_TTL_MS = 24 * 60 * 60 * 1000;
/** Unattached uploads one User may hold at once. */
export const UNATTACHED_UPLOAD_LIMIT = 20;
/** Class dates offered when posting. */
export const CLASS_DATE_LOOKBACK_DAYS = 60;
export const CLASS_DATE_LOOKAHEAD_DAYS = 14;

function text(
  raw: string | null | undefined,
  max: number,
  code: string,
  label: string,
): string | null {
  const value = raw?.trim() ?? "";
  if (value.length === 0) return null;
  if (value.length > max)
    throw new DomainError(
      code,
      `${label} must be ${String(max)} characters or fewer.`,
    );
  return value;
}

export function classWorkTitle(raw: string): string {
  const title = raw.trim();
  if (title.length === 0 || title.length > CLASS_WORK_TITLE_MAX)
    throw new DomainError(
      "CLASS_WORK_TITLE_INVALID",
      `Title must be 1 to ${String(CLASS_WORK_TITLE_MAX)} characters.`,
    );
  return title;
}

/** An absolute http or https URL, as typed after trimming. */
export function linkUrl(raw: string | null | undefined): string | null {
  const value = raw?.trim() ?? "";
  if (value.length === 0) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new DomainError("LINK_URL_INVALID", "Enter a web link (https://…).");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.hostname.length === 0 ||
    value.length > LINK_URL_MAX
  )
    throw new DomainError("LINK_URL_INVALID", "Enter a web link (https://…).");
  return value;
}

function calendarDate(value: string, label: string): string {
  if (!isCalendarDate(value))
    throw new DomainError("CLASS_WORK_DATE_INVALID", `${label} is not a date.`);
  return value;
}

export function attachmentCount(count: number): number {
  if (count > ATTACHMENT_MAX_COUNT)
    throw new DomainError(
      "ATTACHMENT_LIMIT",
      `Attach up to ${String(ATTACHMENT_MAX_COUNT)} files.`,
    );
  return count;
}

export type StudyMaterialContent = {
  title: string;
  note: string | null;
  linkUrl: string | null;
  classDate: string | null;
};

/** A title, plus at least one of a note, a link, or a file. */
export function studyMaterialContent(
  input: {
    title: string;
    note?: string | null;
    linkUrl?: string | null;
    classDate?: string | null;
  },
  attachments: number,
): StudyMaterialContent {
  const content = {
    title: classWorkTitle(input.title),
    note: text(
      input.note,
      STUDY_MATERIAL_NOTE_MAX,
      "STUDY_MATERIAL_NOTE_TOO_LONG",
      "Note",
    ),
    linkUrl: linkUrl(input.linkUrl),
    classDate:
      input.classDate == null || input.classDate === ""
        ? null
        : calendarDate(input.classDate, "Class date"),
  };
  attachmentCount(attachments);
  if (content.note == null && content.linkUrl == null && attachments === 0)
    throw new DomainError(
      "STUDY_MATERIAL_EMPTY",
      "Add a note, a link, or a file.",
    );
  return content;
}

export type HomeworkContent = {
  title: string;
  instructions: string;
  classDate: string;
  dueOn: string;
};

export function homeworkContent(
  input: {
    title: string;
    instructions: string;
    classDate: string;
    dueOn: string;
  },
  attachments: number,
): HomeworkContent {
  const instructions = input.instructions.trim();
  if (
    instructions.length === 0 ||
    instructions.length > HOMEWORK_INSTRUCTIONS_MAX
  )
    throw new DomainError(
      "HOMEWORK_INSTRUCTIONS_INVALID",
      `Instructions must be 1 to ${String(HOMEWORK_INSTRUCTIONS_MAX)} characters.`,
    );
  const classDate = calendarDate(input.classDate, "Class date");
  const dueOn = calendarDate(input.dueOn, "Due date");
  if (dueOn < classDate)
    throw new DomainError(
      "HOMEWORK_DUE_BEFORE_CLASS",
      "The due date can't be before the Class date.",
    );
  attachmentCount(attachments);
  return { title: classWorkTitle(input.title), instructions, classDate, dueOn };
}

export function submissionNote(raw: string | null | undefined): string | null {
  return text(
    raw,
    SUBMISSION_NOTE_MAX,
    "HOMEWORK_SUBMISSION_NOTE_TOO_LONG",
    "Note",
  );
}

export function remark(raw: string | null | undefined): string | null {
  return text(raw, REMARK_MAX, "HOMEWORK_REMARK_TOO_LONG", "Remark");
}

/** A file name safe for a download header: no paths or control characters. */
export function attachmentName(raw: string | null | undefined): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  const cleaned = base
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f"]/g, "")
    .trim()
    .slice(0, ATTACHMENT_NAME_MAX);
  return cleaned.length === 0 ? "attachment" : cleaned;
}

/** Homework is due by the end of its due date in the Batch's timezone. */
export function isOverdue(dueOn: string, now: Date, timezone: string): boolean {
  return localNow(now, timezone).date > dueOn;
}

/** A Submission first made after the due date (Batch timezone) is Late. */
export function isLate(
  submittedAt: Date,
  dueOn: string,
  timezone: string,
): boolean {
  return localNow(submittedAt, timezone).date > dueOn;
}

/**
 * What a Student's time in a Batch gives them. `start` is the local date the
 * Enrollment began; `endedAt` is when access ended (Enrollment ended, Batch
 * closed, or Student dropped), null while it continues.
 */
export type BatchAccess = { start: string; endedAt: Date | null };

/** Students see items posted before they joined, and up to when they left. */
export function canSeeItem(access: BatchAccess, postedAt: Date): boolean {
  return access.endedAt == null || postedAt <= access.endedAt;
}

/** Homework due before a Student joined isn't owed; nor is any after they left. */
export function owesHomework(access: BatchAccess, dueOn: string): boolean {
  return access.endedAt == null && dueOn >= access.start;
}

export type FamilyHomeworkStatus =
  "due" | "overdue" | "submitted" | "late" | "checked" | "reference";

export function familyHomeworkStatus(input: {
  owed: boolean;
  overdue: boolean;
  submission: { late: boolean; checked: boolean } | null;
}): FamilyHomeworkStatus {
  const { submission } = input;
  if (submission != null) {
    if (submission.checked) return "checked";
    return submission.late ? "late" : "submitted";
  }
  if (!input.owed) return "reference";
  return input.overdue ? "overdue" : "due";
}
