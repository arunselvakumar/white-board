import type { MemberAccess } from "@/src/shared-kernel/access";
import { todayIn, type CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { DomainError } from "@/src/shared-kernel/domain-error";
import {
  addMonths,
  allTimeOf,
  dayStatus,
  firstDayOf,
  headDays,
  lastDayOf,
  monthOf,
  monthsBetween,
  type AttendanceAllTime,
  type AttendanceDayRow,
  type AttendanceDayStatus,
  type AttendanceHoursFrom,
  type AttendanceMeasure,
  type CalendarMonth,
  type PersonAttendanceSource,
} from "@/src/shared-kernel/person-attendance";

import { resolveProjects, type ProjectNames } from "./labour-activity";

/** Months a page covers when the request does not say (ADR CM-0051 §2). */
export const ATTENDANCE_PAGE_MONTHS = 6;
export const ATTENDANCE_MAX_MONTHS = 12;

/** A place as the tab shows it. */
export type AttendancePlace = {
  kind: "project" | "branch";
  id: string;
  name: string;
  /** A Project the viewer may open; always false for a branch. */
  canOpen: boolean;
};

export type AttendancePlaceDay = {
  place: AttendancePlace;
  status: AttendanceDayStatus | null;
  checkIn: string | null;
  checkOut: string | null;
  workedMinutes: number;
  overtimeMinutes: number;
  hoursFrom: AttendanceHoursFrom;
  open: boolean;
  pending: boolean;
  heads: { full: number; half: number; headDays: number } | null;
};

export type AttendanceDay = {
  date: CalendarDate;
  status: AttendanceDayStatus;
  workedMinutes: number;
  overtimeMinutes: number;
  /** A Vendor's head-days that day; null for everyone else. */
  headDays: number | null;
  places: AttendancePlaceDay[];
};

export type PersonAttendance = {
  measure: AttendanceMeasure;
  /** Absences are recorded (Labours, Office Staff); a log has none. */
  recordsAbsence: boolean;
  timeZone: string;
  today: CalendarDate;
  /** The person's first month: no earlier month is ever loaded. */
  firstMonth: CalendarMonth;
  /** Every month of the page, oldest first, each with its days in date order. */
  months: { month: CalendarMonth; days: AttendanceDay[] }[];
  /** The `to` of the next page back, or null at the first month. */
  earlierTo: CalendarMonth | null;
  /** On the first page only (no `to` asked). */
  allTime: AttendanceAllTime | null;
};

export type PersonAttendanceRequest = {
  /** Newest month of the page; this month when null. */
  to: CalendarMonth | null;
  months: number;
};

/**
 * A person's Attendance tab (ADR CM-0051): a page of months of days and,
 * on the first page, the all-time figures. Each kind of person gets one,
 * built over its own source.
 */
export class PersonAttendanceService {
  constructor(
    private readonly options: {
      source: PersonAttendanceSource;
      measure: AttendanceMeasure;
      recordsAbsence: boolean;
      /** Projects the viewer may see this person's days at; null for every one. */
      visibleProjectIds: (access: MemberAccess) => readonly string[] | null;
      projectNames: ProjectNames;
      timeZoneOf: (workspaceId: string) => Promise<string>;
      notFound: () => DomainError;
      now?: () => Date;
    },
  ) {}

  async calendar(
    access: MemberAccess,
    personId: string,
    request: PersonAttendanceRequest,
  ): Promise<PersonAttendance> {
    const { source } = this.options;
    const { workspaceId } = access;
    const timeZone = await this.options.timeZoneOf(workspaceId);
    const person = await source.person(workspaceId, personId, timeZone);
    if (person == null) throw this.options.notFound();
    const today = todayIn(timeZone, this.options.now?.() ?? new Date());
    const visibleProjectIds = this.options.visibleProjectIds(access);
    const scope = { workspaceId, personId, visibleProjectIds, timeZone };

    const first = await source.firstDay(scope);
    const firstMonth = monthOf(
      first != null && first < person.since ? first : person.since,
    );
    const thisMonth = monthOf(today);
    const toMonth = request.to ?? thisMonth;
    const count = Math.min(Math.max(request.months, 1), ATTENDANCE_MAX_MONTHS);
    const wantedFrom = addMonths(toMonth, 1 - count);
    const fromMonth = wantedFrom < firstMonth ? firstMonth : wantedFrom;

    const months =
      toMonth < firstMonth ? [] : monthsBetween(fromMonth, toMonth);
    const rows =
      months.length === 0
        ? []
        : await source.days({
            ...scope,
            from: firstDayOf(fromMonth),
            to: lastDayOf(toMonth),
          });
    const allRows =
      request.to == null
        ? await source.days({
            ...scope,
            from: firstDayOf(firstMonth),
            to: lastDayOf(thisMonth),
          })
        : null;

    const project = await resolveProjects(
      this.options.projectNames,
      access,
      rows.flatMap((row) =>
        row.places.flatMap((place) =>
          place.place.kind === "project" ? [place.place.projectId] : [],
        ),
      ),
    );
    const days = rows
      .filter((row) => row.places.length > 0 || row.status != null)
      .map((row) => toDay(row, project))
      .sort((a, b) => a.date.localeCompare(b.date));
    const byMonth = new Map<CalendarMonth, AttendanceDay[]>(
      months.map((month) => [month, []]),
    );
    for (const day of days) byMonth.get(monthOf(day.date))?.push(day);

    return {
      measure: this.options.measure,
      recordsAbsence: this.options.recordsAbsence,
      timeZone,
      today,
      firstMonth,
      months: months.map((month) => ({
        month,
        days: byMonth.get(month) ?? [],
      })),
      earlierTo:
        months.length > 0 && fromMonth > firstMonth
          ? addMonths(fromMonth, -1)
          : null,
      allTime:
        allRows == null
          ? null
          : allTimeOf(
              allRows.filter(
                (row) => row.places.length > 0 || row.status != null,
              ),
            ),
    };
  }
}

function toDay(
  row: AttendanceDayRow,
  project: (id: string) => { id: string; name: string; canOpen: boolean },
): AttendanceDay {
  const places = row.places.map((place): AttendancePlaceDay => ({
    place:
      place.place.kind === "project"
        ? { kind: "project", ...project(place.place.projectId) }
        : {
            kind: "branch",
            id: place.place.branchId,
            name: place.place.name,
            canOpen: false,
          },
    status: place.status,
    checkIn: place.checkIn,
    checkOut: place.checkOut,
    workedMinutes: place.workedMinutes,
    overtimeMinutes: place.overtimeMinutes,
    hoursFrom: place.hoursFrom,
    open: place.open,
    pending: place.pending,
    heads:
      place.heads == null
        ? null
        : { ...place.heads, headDays: headDays(place.heads) },
  }));
  const heads = places.filter((place) => place.heads != null);
  return {
    date: row.date,
    status: dayStatus(row),
    workedMinutes: places.reduce((sum, place) => sum + place.workedMinutes, 0),
    overtimeMinutes: places.reduce(
      (sum, place) => sum + place.overtimeMinutes,
      0,
    ),
    headDays:
      heads.length === 0
        ? null
        : heads.reduce((sum, place) => sum + (place.heads?.headDays ?? 0), 0),
    places,
  };
}
