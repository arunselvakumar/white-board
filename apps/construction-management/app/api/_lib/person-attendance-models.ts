import { z } from "zod";

import {
  ATTENDANCE_MAX_MONTHS,
  ATTENDANCE_PAGE_MONTHS,
  type PersonAttendance,
} from "@/src/composition/person-attendance";
import { ATTENDANCE_DAY_STATUSES } from "@/src/shared-kernel/person-attendance";

const month = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .describe("Calendar month, YYYY-MM.");
const calendarDate = z.iso.date().describe("Calendar date, YYYY-MM-DD.");

/** The query of every person's Attendance route (ADR CM-0051 §6). */
export const ConstructionPersonAttendanceRequestModel = z.object({
  /** Newest month of the page; this month when left out. The all-time figures come only then. */
  to: month.optional(),
  /** Months in the page, newest last. */
  months: z.coerce
    .number()
    .int()
    .min(1)
    .max(ATTENDANCE_MAX_MONTHS)
    .default(ATTENDANCE_PAGE_MONTHS),
});

const status = z
  .enum(ATTENDANCE_DAY_STATUSES)
  .describe(
    "Present, Half Day, Paid Leave (On Leave that is paid), On Leave, Holiday, Week Off (HRMS) or Absent.",
  );

const placeDay = z.object({
  place: z.object({
    kind: z.enum(["project", "branch"]),
    id: z.uuid(),
    /** "Deleted Project" when its row is gone. */
    name: z.string(),
    /** A live Project the viewer is on (or the Owner); false for a branch. */
    canOpen: z.boolean(),
  }),
  /** The status marked at this place (Labours); null where none is marked. */
  status: status.nullable(),
  /** `HH:MM`, Company time. */
  checkIn: z.string().nullable(),
  /** `HH:MM`; at or before `checkIn` is the next day. */
  checkOut: z.string().nullable(),
  workedMinutes: z.number().int().nonnegative(),
  overtimeMinutes: z.number().int().nonnegative(),
  /** times: In and Out; working_hours: a day marked without times; none: no hours. */
  hoursFrom: z.enum(["times", "working_hours", "none"]),
  /** Checked in with no Check Out yet; adds no hours. */
  open: z.boolean(),
  /** HRMS entries awaiting approval; add no hours. */
  pending: z.boolean(),
  /** A Vendor's headcount; null for everyone else. */
  heads: z
    .object({
      full: z.number().int().nonnegative(),
      half: z.number().int().nonnegative(),
      /** full + half ÷ 2. */
      headDays: z.number().nonnegative(),
    })
    .nullable(),
});

const day = z.object({
  date: calendarDate,
  status,
  workedMinutes: z.number().int().nonnegative(),
  overtimeMinutes: z.number().int().nonnegative(),
  /** A Vendor's head-days; null for everyone else. */
  headDays: z.number().nonnegative().nullable(),
  places: z.array(placeDay),
});

export const ConstructionPersonAttendanceResponseModel = z.object({
  /** What a day's shade measures: hours, or a Vendor's head-days. */
  measure: z.enum(["hours", "head_days"]),
  /** Absences are recorded (Labours, Office Staff); the Check-In log and a Vendor's headcount have none. */
  recordsAbsence: z.boolean(),
  /** The Company's IANA time zone. */
  timeZone: z.string(),
  /** Today in the Company's time zone. */
  today: calendarDate,
  /** The person's first month; no earlier month has days. */
  firstMonth: month,
  /** Every month of the page, oldest first; only days with attendance are listed. */
  months: z.array(z.object({ month, days: z.array(day) })),
  /** Send as `to` for the page before; null at the first month. */
  earlierTo: month.nullable(),
  /** On the first page only (no `to`). */
  allTime: z
    .object({
      firstDay: calendarDate.nullable(),
      lastDay: calendarDate.nullable(),
      /** A Half Day counts as half; a Vendor's days supplied. */
      daysWorked: z.number().nonnegative(),
      workedMinutes: z.number().int().nonnegative(),
      overtimeMinutes: z.number().int().nonnegative(),
      /** A Vendor's head-days; 0 for everyone else. */
      headDays: z.number().nonnegative(),
      /** Distinct Projects (and branches) worked at. */
      places: z.number().int().nonnegative(),
    })
    .nullable(),
});

export type ConstructionPersonAttendanceResponseModel = z.infer<
  typeof ConstructionPersonAttendanceResponseModel
>;

export function toPersonAttendanceResponse(
  attendance: PersonAttendance,
): ConstructionPersonAttendanceResponseModel {
  return attendance;
}
