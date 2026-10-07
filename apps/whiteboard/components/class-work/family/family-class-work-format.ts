import type { FamilyHomeRole } from "@/components/home/family-home";
import type {
  FamilyBatchView,
  FamilyClassWorkStudentView,
  FamilyHomeworkStatus,
  FamilyHomeworkView,
  FamilyStudyMaterialView,
} from "@/src/queries/class-work";
import type { PostedByView } from "@/src/training-institute/application/class-work-views";
import {
  addCalendarDays,
  daysBetween,
  localNow,
} from "@/src/training-institute/domain/class-schedule";

/** Where a Student's or Parent's Homework page lives. */
export function homeworkPagePath(role: FamilyHomeRole): string {
  return role === "org:parent" ? "/parent/homework" : "/student/homework";
}

export function homeworkDetailPath(
  role: FamilyHomeRole,
  homeworkId: string,
  studentId: string,
): string {
  return `${homeworkPagePath(role)}/${homeworkId}?student=${encodeURIComponent(studentId)}`;
}

/** "Mon, 5 Oct" for a YYYY-MM-DD date. */
export function calendarDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

function weekdayName(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

/** "Tue, 6 Oct, 5:30 pm" for an instant, in the Batch's timezone. */
export function instantLabel(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(iso));
}

/** "Tue, 6 Oct" for an instant, in the Batch's timezone. */
export function instantDate(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: timezone,
  }).format(new Date(iso));
}

const FALLBACK_TIMEZONE = "Asia/Kolkata";

export function findBatch(
  student: FamilyClassWorkStudentView,
  batchId: string,
): FamilyBatchView | undefined {
  return student.batches.find((batch) => batch.id === batchId);
}

export function batchTimezone(batch: FamilyBatchView | undefined): string {
  return batch?.timezone ?? FALLBACK_TIMEZONE;
}

/** "Python · Python Evening", or nothing when the Batch isn't listed. */
export function batchLabel(batch: FamilyBatchView | undefined): string | null {
  return batch == null ? null : `${batch.courseName} · ${batch.name}`;
}

/** Today in the Batch's timezone. */
export function batchToday(batch: FamilyBatchView | undefined, now: Date) {
  return localNow(now, batchTimezone(batch)).date;
}

/** "Due today", "Due tomorrow", or "Due: Wed, 7 Oct". */
export function dueLabel(
  homework: Pick<FamilyHomeworkView, "dueOn" | "status">,
  today: string,
): string {
  if (homework.status === "due" || homework.status === "overdue") {
    if (homework.dueOn === today) return "Due today";
    if (homework.dueOn === addCalendarDays(today, 1)) return "Due tomorrow";
  }
  return `Due: ${calendarDate(homework.dueOn)}`;
}

/** "From today’s Class", "From Monday’s Class", or "From the Class on Mon, 5 Oct". */
export function classDatePhrase(classDate: string, today: string): string {
  const ago = daysBetween(classDate, today);
  if (ago === 0) return "From today’s Class";
  if (ago === 1) return "From yesterday’s Class";
  if (ago > 1 && ago < 7) return `From ${weekdayName(classDate)}’s Class`;
  return `From the Class on ${calendarDate(classDate)}`;
}

export function postedByLabel(postedBy: PostedByView): string {
  if (postedBy.role === "owner") return "the centre";
  return postedBy.teacherName ?? "a Teacher";
}

export const STATUS_LABELS: Record<FamilyHomeworkStatus, string> = {
  due: "Not submitted",
  overdue: "Overdue",
  submitted: "Submitted",
  late: "Late",
  checked: "Checked",
  reference: "For reference",
};

export type HomeworkGroups = {
  overdue: FamilyHomeworkView[];
  due: FamilyHomeworkView[];
  submitted: FamilyHomeworkView[];
  checked: FamilyHomeworkView[];
  reference: FamilyHomeworkView[];
};

function byDueThenClass(a: FamilyHomeworkView, b: FamilyHomeworkView) {
  return (
    a.dueOn.localeCompare(b.dueOn) || a.classDate.localeCompare(b.classDate)
  );
}

function newestFirst(a: string | null, b: string | null) {
  return (b ?? "").localeCompare(a ?? "");
}

/** Overdue and Due soonest first; Submitted and Checked most recent first. */
export function groupHomework(
  homework: readonly FamilyHomeworkView[],
): HomeworkGroups {
  const groups: HomeworkGroups = {
    overdue: [],
    due: [],
    submitted: [],
    checked: [],
    reference: [],
  };
  for (const item of homework) {
    if (item.status === "late") groups.submitted.push(item);
    else groups[item.status].push(item);
  }
  groups.overdue.sort(byDueThenClass);
  groups.due.sort(byDueThenClass);
  groups.submitted.sort((a, b) =>
    newestFirst(
      a.submission?.submittedAt ?? null,
      b.submission?.submittedAt ?? null,
    ),
  );
  groups.checked.sort((a, b) =>
    newestFirst(
      a.submission?.checkedAt ?? null,
      b.submission?.checkedAt ?? null,
    ),
  );
  groups.reference.sort((a, b) => b.classDate.localeCompare(a.classDate));
  return groups;
}

/** Overdue first, then Homework due in the next 7 days; at most `limit`. */
export function homeworkNeedingAttention(
  student: FamilyClassWorkStudentView,
  now: Date,
  limit = 5,
): FamilyHomeworkView[] {
  const groups = groupHomework(student.homework);
  const dueSoon = groups.due.filter((item) => {
    const today = batchToday(findBatch(student, item.batchId), now);
    return item.dueOn <= addCalendarDays(today, 7);
  });
  return [...groups.overdue, ...dueSoon].slice(0, limit);
}

export function newestMaterials(
  materials: readonly FamilyStudyMaterialView[],
  limit?: number,
): FamilyStudyMaterialView[] {
  const sorted = [...materials].sort((a, b) =>
    b.postedAt.localeCompare(a.postedAt),
  );
  return limit == null ? sorted : sorted.slice(0, limit);
}

/** "docs.python.org" for a link; the link itself when it doesn't parse. */
export function linkHost(linkUrl: string): string {
  try {
    return new URL(linkUrl).hostname.replace(/^www\./, "");
  } catch {
    return linkUrl;
  }
}
