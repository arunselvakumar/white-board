import type { MockRoute } from "@/.storybook/mock-fetch";
import type {
  PersonAttendanceDay,
  PersonAttendancePage,
  PersonAttendancePlace,
} from "@/src/queries/person-attendance";

/**
 * Attendance tab fixtures (ADR CM-0051): days made up from a rule per
 * date, served a page of months at a time the way the route pages them.
 */

export const ATTENDANCE_TODAY = "2026-11-18";

export const SKY_TOWERS = {
  kind: "project" as const,
  id: "0195f0a0-0000-7000-8000-000000000a01",
  name: "Sky Towers",
  canOpen: true,
};
export const VILLA_PHASE_2 = {
  kind: "project" as const,
  id: "0195f0a0-0000-7000-8000-000000000a02",
  name: "Villa Phase 2",
  canOpen: true,
};
export const HEAD_OFFICE = {
  kind: "branch" as const,
  id: "0195f0a0-0000-7000-8000-000000000b01",
  name: "Head Office",
  canOpen: false,
};

type Place = PersonAttendancePlace["place"];

export function place(
  where: Place,
  overrides: Partial<Omit<PersonAttendancePlace, "place">> = {},
): PersonAttendancePlace {
  return {
    place: where,
    status: null,
    checkIn: "09:00",
    checkOut: "18:00",
    workedMinutes: 480,
    overtimeMinutes: 0,
    hoursFrom: "times",
    open: false,
    pending: false,
    heads: null,
    ...overrides,
  };
}

export function day(
  date: string,
  status: PersonAttendanceDay["status"],
  places: PersonAttendancePlace[],
): PersonAttendanceDay {
  const heads = places.filter((p) => p.heads != null);
  return {
    date,
    status,
    workedMinutes: places.reduce((sum, p) => sum + p.workedMinutes, 0),
    overtimeMinutes: places.reduce((sum, p) => sum + p.overtimeMinutes, 0),
    headDays:
      heads.length === 0
        ? null
        : heads.reduce((sum, p) => sum + (p.heads?.headDays ?? 0), 0),
    places,
  };
}

function weekday(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

/** A stable 0–99 per date, so the pattern looks lived-in but never changes. */
function noise(date: string): number {
  let hash = 7;
  for (const char of date) hash = (hash * 31 + char.charCodeAt(0)) % 9973;
  return hash % 100;
}

/** A Labour: Sundays off, Saturdays half, some overtime, two Projects on Mondays in November. */
export function labourDay(date: string): PersonAttendanceDay | undefined {
  const dow = weekday(date);
  const n = noise(date);
  if (dow === 0)
    return n < 60
      ? day(date, "holiday", [
          place(SKY_TOWERS, {
            status: "holiday",
            checkIn: null,
            checkOut: null,
            workedMinutes: 0,
            hoursFrom: "none",
          }),
        ])
      : undefined;
  if (date >= "2026-11-01" && dow === 1)
    return day(date, "present", [
      place(SKY_TOWERS, {
        status: "present",
        checkIn: "08:30",
        checkOut: "13:00",
        workedMinutes: 270,
      }),
      place(VILLA_PHASE_2, {
        status: "present",
        checkIn: "14:00",
        checkOut: "19:30",
        workedMinutes: 330,
        overtimeMinutes: 120,
      }),
    ]);
  if (n < 6)
    return day(date, "absent", [
      place(SKY_TOWERS, {
        status: "absent",
        checkIn: null,
        checkOut: null,
        workedMinutes: 0,
        hoursFrom: "none",
      }),
    ]);
  if (n < 9)
    return day(date, n < 7 ? "paid_leave" : "on_leave", [
      place(SKY_TOWERS, {
        status: n < 7 ? "paid_leave" : "on_leave",
        checkIn: null,
        checkOut: null,
        workedMinutes: 0,
        hoursFrom: "none",
      }),
    ]);
  if (dow === 6)
    return day(date, "half_day", [
      place(SKY_TOWERS, {
        status: "half_day",
        checkIn: "09:00",
        checkOut: "13:00",
        workedMinutes: 240,
      }),
    ]);
  if (n < 20)
    return day(date, "present", [
      place(SKY_TOWERS, {
        status: "present",
        checkIn: null,
        checkOut: null,
        workedMinutes: 480,
        hoursFrom: "working_hours",
      }),
    ]);
  const overtime = n > 85 ? 150 : 0;
  return day(date, "present", [
    place(SKY_TOWERS, {
      status: "present",
      checkIn: "09:00",
      checkOut: overtime > 0 ? "20:30" : "18:00",
      workedMinutes: 480 + overtime,
      overtimeMinutes: overtime,
    }),
  ]);
}

/** A Vendor: a headcount most days, more heads on the bigger Project. */
export function vendorDay(date: string): PersonAttendanceDay | undefined {
  const n = noise(date);
  if (weekday(date) === 0 || n < 10) return undefined;
  const heads = (full: number, half: number) => ({
    full,
    half,
    headDays: full + half / 2,
  });
  const at = (where: Place, full: number, half: number, overtime = 0) =>
    place(where, {
      checkIn: null,
      checkOut: null,
      workedMinutes: 0,
      hoursFrom: "none",
      overtimeMinutes: overtime,
      heads: heads(full, half),
    });
  return day(
    date,
    "present",
    n > 60
      ? [
          at(SKY_TOWERS, 4 + (n % 9), n % 3, n > 90 ? 240 : 0),
          at(VILLA_PHASE_2, 2 + (n % 4), 0),
        ]
      : [at(SKY_TOWERS, 3 + (n % 12), n % 2)],
  );
}

function addMonths(month: string, count: number): string {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  const index = y * 12 + m - 1 + count;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function datesOf(month: string, today: string): string[] {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from(
    { length: last },
    (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`,
  ).filter((date) => date <= today);
}

export type AttendanceFixture = {
  measure?: PersonAttendancePage["measure"];
  recordsAbsence?: boolean;
  today?: string;
  firstMonth: string;
  dayFor: (date: string) => PersonAttendanceDay | undefined;
};

/** One page, as the route answers `?to=` (this month when null). */
export function attendancePage(
  fixture: AttendanceFixture,
  to: string | null,
  months = 6,
): PersonAttendancePage {
  const today = fixture.today ?? ATTENDANCE_TODAY;
  const thisMonth = today.slice(0, 7);
  const toMonth = to ?? thisMonth;
  const wanted = addMonths(toMonth, 1 - months);
  const fromMonth = wanted < fixture.firstMonth ? fixture.firstMonth : wanted;
  const list: string[] = [];
  for (let m = fromMonth; m <= toMonth; m = addMonths(m, 1)) list.push(m);
  const allDays = (from: string, until: string) => {
    const days: PersonAttendanceDay[] = [];
    for (let m = from; m <= until; m = addMonths(m, 1))
      for (const date of datesOf(m, today)) {
        const found = fixture.dayFor(date);
        if (found != null) days.push(found);
      }
    return days;
  };
  const everything = to == null ? allDays(fixture.firstMonth, thisMonth) : [];
  const worked = everything.filter(
    (d) =>
      d.status === "present" ||
      d.status === "half_day" ||
      (d.headDays ?? 0) > 0,
  );
  const placeIds = new Set(
    worked.flatMap((d) => d.places.map((p) => p.place.id)),
  );
  return {
    measure: fixture.measure ?? "hours",
    recordsAbsence: fixture.recordsAbsence ?? true,
    timeZone: "Asia/Kolkata",
    today,
    firstMonth: fixture.firstMonth,
    months: list.map((month) => ({ month, days: allDays(month, month) })),
    earlierTo: fromMonth > fixture.firstMonth ? addMonths(fromMonth, -1) : null,
    allTime:
      to != null
        ? null
        : {
            firstDay: worked[0]?.date ?? null,
            lastDay: worked.at(-1)?.date ?? null,
            daysWorked: worked.reduce(
              (sum, d) => sum + (d.status === "half_day" ? 0.5 : 1),
              0,
            ),
            workedMinutes: worked.reduce((sum, d) => sum + d.workedMinutes, 0),
            overtimeMinutes: worked.reduce(
              (sum, d) => sum + d.overtimeMinutes,
              0,
            ),
            headDays: worked.reduce((sum, d) => sum + (d.headDays ?? 0), 0),
            places: placeIds.size,
          },
  };
}

/** A mock route for `{base}/attendance` that pages like the server. */
export function attendanceRoute(
  path: string,
  fixture: AttendanceFixture,
): MockRoute {
  return {
    path,
    respond: ({ search }) =>
      Response.json(attendancePage(fixture, search.get("to"))),
  };
}

export const LABOUR_ATTENDANCE: AttendanceFixture = {
  firstMonth: "2025-12",
  dayFor: labourDay,
};

export const VENDOR_ATTENDANCE: AttendanceFixture = {
  measure: "head_days",
  recordsAbsence: false,
  firstMonth: "2026-03",
  dayFor: vendorDay,
};

export const NO_ATTENDANCE: AttendanceFixture = {
  firstMonth: "2026-11",
  dayFor: () => undefined,
};

/** HRMS's place for an entry that matched no fence (ADR CM-0051 §3). */
export const NO_FENCE_MATCHED = {
  kind: "branch" as const,
  id: "00000000-0000-0000-0000-000000000000",
  name: "No fence matched",
  canOpen: false,
};

/**
 * An Office Staff member (HRMS): Sundays off, Head Office most days, Sky
 * Towers' site on Thursdays, a back-dated day awaiting approval, an
 * absence, paid and unpaid leave, and today checked in with no check-out.
 */
export function officeStaffDay(date: string): PersonAttendanceDay {
  const dow = weekday(date);
  const n = noise(date);
  if (dow === 0) return day(date, "week_off", []);
  if (date === "2026-11-14") return day(date, "holiday", []);
  if (date === ATTENDANCE_TODAY)
    return day(date, "absent", [
      place(HEAD_OFFICE, {
        checkIn: "09:20",
        checkOut: null,
        workedMinutes: 0,
        open: true,
      }),
    ]);
  if (date === "2026-11-12")
    return day(date, "absent", [
      place(NO_FENCE_MATCHED, { workedMinutes: 0, pending: true }),
    ]);
  if (n < 5) return day(date, "absent", []);
  if (n < 8) return day(date, n < 7 ? "paid_leave" : "on_leave", []);
  if (dow === 4)
    return day(date, "present", [
      place(HEAD_OFFICE, {
        checkIn: "09:05",
        checkOut: "12:30",
        workedMinutes: 205,
      }),
      place(SKY_TOWERS, {
        checkIn: "13:15",
        checkOut: "19:10",
        workedMinutes: 355,
        overtimeMinutes: n > 60 ? 60 : 0,
      }),
    ]);
  if (dow === 6)
    return day(date, "half_day", [
      place(HEAD_OFFICE, {
        checkIn: "09:30",
        checkOut: "14:00",
        workedMinutes: 270,
      }),
    ]);
  return day(date, "present", [
    place(HEAD_OFFICE, {
      checkIn: n < 20 ? "09:40" : "09:00",
      checkOut: "18:15",
      workedMinutes: n < 20 ? 515 : 555,
    }),
  ]);
}

export const OFFICE_STAFF_ATTENDANCE: AttendanceFixture = {
  firstMonth: "2026-06",
  dayFor: officeStaffDay,
};
