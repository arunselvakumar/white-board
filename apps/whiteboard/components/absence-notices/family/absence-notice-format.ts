// Words and grouping for the Student and Parent Absence Notice screens
// (ADR-0041). Pure: no React, no I/O.

import type { FamilyHomeRole } from "@/components/home/family-home";
import type {
  FamilyAbsenceNoticeView,
  PickableClassView,
} from "@/src/queries/absence-notices";
import {
  addCalendarDays,
  localNow,
} from "@/src/training-institute/domain/class-schedule";

function calendarDate(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00.000Z`));
}

/** "Today", "Tomorrow", or "Thu, 1 Oct", for a date local to `timezone`. */
export function noticeDayLabel(
  date: string,
  timezone: string,
  now: Date,
): string {
  const today = localNow(now, timezone).date;
  if (date === today) return "Today";
  if (date === addCalendarDays(today, 1)) return "Tomorrow";
  return calendarDate(date);
}

/** "Tomorrow · 18:00–19:00" */
export function noticeClassWhen(
  slot: { date: string; startTime: string; endTime: string; timezone: string },
  now: Date,
): string {
  return `${noticeDayLabel(slot.date, slot.timezone, now)} · ${slot.startTime}–${slot.endTime}`;
}

/**
 * Who gave the notice, as the viewer reads it. A Student viewing a notice a
 * Student gave reads "you"; a Parent can't tell one Parent from another by
 * role alone, so Parents always see the name.
 */
export function givenByLabel(
  givenBy: FamilyAbsenceNoticeView["givenBy"],
  viewer: FamilyHomeRole,
): string {
  if (viewer === "student" && givenBy.role === "student") return "Given by you";
  const who = givenBy.role === "parent" ? "Parent" : "Student";
  return `Given by ${who} · ${givenBy.name}`;
}

/** Why a notice no longer applies, or null while it does. */
export function standingLabel(notice: FamilyAbsenceNoticeView): string | null {
  switch (notice.standing) {
    case "applies":
      return null;
    case "cancelled":
      return "Class cancelled";
    case "holiday":
      return "Holiday";
    case "moved":
      return notice.movedTo == null
        ? "Class moved — give notice again if you’ll miss it"
        : `Class moved to ${calendarDate(notice.movedTo.date)} ${notice.movedTo.startTime} — give notice again if you’ll miss it`;
    case "not_scheduled":
      return "No longer scheduled";
  }
}

/** A Class in the picker, as one form value. */
export function pickKey(item: {
  enrollmentId: string;
  date: string;
  startTime: string;
}): string {
  return `${item.enrollmentId}|${item.date}|${item.startTime}`;
}

export type ClassDay = { date: string; classes: PickableClassView[] };

/** Classes by date, keeping the API's date and time order. */
export function classesByDay(
  classes: readonly PickableClassView[],
): ClassDay[] {
  const days: ClassDay[] = [];
  for (const item of classes) {
    const last = days.at(-1);
    if (last?.date === item.date) last.classes.push(item);
    else days.push({ date: item.date, classes: [item] });
  }
  return days;
}

export function classCount(count: number): string {
  return count === 1 ? "1 Class" : `${String(count)} Classes`;
}
