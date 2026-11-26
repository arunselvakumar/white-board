import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  minutesOfHours,
  type AttendanceDayRow,
  type AttendanceDayStatus,
  type AttendancePlaceRef,
  type AttendancePlaceRow,
} from "@/src/shared-kernel/person-attendance";

import {
  countsTowardHours,
  type ApprovalStatus,
  type DayStatus,
} from "./attendance";
import { localTime } from "./company-time";

/**
 * The place an entry checked in at when it matched no fence: GPS was off,
 * the check-in was accepted out of fence, or it is a back-dated day or a
 * missed checkout (which carry no location). One stable place per day, so
 * those hours still show (ADR CM-0051 §3).
 */
export const NO_FENCE_PLACE = {
  kind: "branch",
  branchId: "00000000-0000-0000-0000-000000000000",
  name: "No fence matched",
} as const satisfies AttendancePlaceRef;

/** The branch (or Project site) an entry checked in at. */
export type CalendarBranch = {
  id: string;
  name: string;
  /** Set for a Project site. */
  projectId: string | null;
};

/** An HRMS attendance entry as the Attendance tab reads it. */
export type CalendarEntry = {
  checkInAt: Date;
  checkOutAt: Date | null;
  approvalStatus: ApprovalStatus;
  /** The branch matched at check-in; null when none did (or it is gone). */
  branch: CalendarBranch | null;
};

/** A member's day as the HRMS day rule (ADR CM-0012 §2) worked it out. */
export type CalendarRuleDay = {
  date: CalendarDate;
  status: DayStatus;
  /** On `on_leave`: whether every leave of the day is paid. */
  leave: { paid: boolean } | null;
  overtimeHours: number;
};

/** HRMS On Leave that is paid shows as Paid Leave; the rest as they are. */
export function calendarStatus(day: CalendarRuleDay): AttendanceDayStatus {
  if (day.status === "on_leave")
    return day.leave?.paid === false ? "on_leave" : "paid_leave";
  return day.status;
}

function placeOf(branch: CalendarBranch | null): AttendancePlaceRef {
  if (branch == null) return NO_FENCE_PLACE;
  if (branch.projectId != null)
    return { kind: "project", projectId: branch.projectId };
  return { kind: "branch", branchId: branch.id, name: branch.name };
}

function keyOf(place: AttendancePlaceRef): string {
  return place.kind === "project"
    ? `project:${place.projectId}`
    : `branch:${place.branchId}`;
}

const MINUTE_MS = 60_000;

/**
 * A day's entries by the place checked in at (ADR CM-0051 §3): an office
 * branch by name, a Project site as its Project, no fence as
 * `NO_FENCE_PLACE`. Closed entries that need no approval or are approved
 * add their minutes; pending entries show (`pending`) and add none; an
 * entry with no check-out shows (`open`) and adds none; rejected entries
 * are left out. In is the first check-in, Out the last check-out (none
 * while an entry is open), in the Company's time. The day's overtime goes
 * on the place with the most minutes (the first of equals). Places are in
 * check-in order.
 */
export function hrmsCalendarPlaces(
  entries: readonly CalendarEntry[],
  overtimeHours: number,
  timeZone: string,
): AttendancePlaceRow[] {
  const groups = new Map<
    string,
    { place: AttendancePlaceRef; entries: CalendarEntry[] }
  >();
  const live = entries
    .filter((entry) => entry.approvalStatus !== "rejected")
    .sort((a, b) => a.checkInAt.getTime() - b.checkInAt.getTime());
  for (const entry of live) {
    const place = placeOf(entry.branch);
    const key = keyOf(place);
    const group = groups.get(key) ?? { place, entries: [] };
    group.entries.push(entry);
    groups.set(key, group);
  }

  const rows = [...groups.values()].map((group): AttendancePlaceRow => {
    const counted = group.entries.filter(countsTowardHours);
    const workedMs = counted.reduce(
      (sum, entry) =>
        sum + ((entry.checkOutAt?.getTime() ?? 0) - entry.checkInAt.getTime()),
      0,
    );
    const open = group.entries.some((entry) => entry.checkOutAt == null);
    const outs = group.entries.flatMap((entry) =>
      entry.checkOutAt == null ? [] : [entry.checkOutAt.getTime()],
    );
    const first = group.entries[0];
    return {
      place: group.place,
      status: null,
      checkIn: first == null ? null : localTime(first.checkInAt, timeZone),
      checkOut:
        open || outs.length === 0
          ? null
          : localTime(new Date(Math.max(...outs)), timeZone),
      workedMinutes: Math.max(0, Math.round(workedMs / MINUTE_MS)),
      overtimeMinutes: 0,
      hoursFrom: "times",
      open,
      pending: group.entries.some(
        (entry) => entry.approvalStatus === "pending",
      ),
      heads: null,
    };
  });

  const overtime = minutesOfHours(overtimeHours);
  if (overtime > 0) {
    let most: AttendancePlaceRow | null = null;
    for (const row of rows)
      if (
        row.workedMinutes > 0 &&
        row.workedMinutes > (most?.workedMinutes ?? 0)
      )
        most = row;
    if (most != null) most.overtimeMinutes = overtime;
  }
  return rows;
}

/** One HRMS day for the Attendance tab: the rule's status and the places. */
export function hrmsCalendarDay(
  day: CalendarRuleDay,
  entries: readonly CalendarEntry[],
  timeZone: string,
): AttendanceDayRow {
  return {
    date: day.date,
    status: calendarStatus(day),
    places: hrmsCalendarPlaces(entries, day.overtimeHours, timeZone),
  };
}
