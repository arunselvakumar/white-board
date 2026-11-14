import type { EntryTimes } from "./check-in";
import type {
  DayMark,
  OvertimeInput,
  PricedOvertime,
} from "./labour-attendance";
import type { AttendanceStatus } from "./wages";

/**
 * The marks Check-In prices a Labour's day from (ADR CM-0043 §3), so the
 * day is priced and posted exactly as the marking sheet prices it.
 */

/** A day Check-In creates: Present, the times, one overtime line from them. */
export function createdDayMark(input: {
  labourId: string;
  times: EntryTimes;
  /** The Labour's Labour Category, for the overtime line. */
  labourCategoryId: string | null;
}): DayMark {
  return {
    labourId: input.labourId,
    status: "present",
    checkIn: input.times.checkIn,
    checkOut: input.times.checkOut,
    breakMinutes: input.times.breakMinutes,
    overtime: [{ labourCategoryId: input.labourCategoryId, fromTimes: true }],
  };
}

/** What a stored day keeps when Check-In replaces its times. */
export type StoredDayForTimes = {
  labourId: string;
  status: AttendanceStatus;
  isPaidLeave: boolean;
  shift: string | null;
  overtime: readonly PricedOvertime[];
};

/**
 * A stored day with new times from the log (or none): status, Paid Leave,
 * shift and overtime lines stay, each line with its category and rate,
 * and a typed line with its hours. The line from the times follows the
 * new times; it is added only when the day has no overtime lines, so a
 * day whose overtime was typed by hand keeps exactly those lines.
 */
export function timesDayMark(input: {
  day: StoredDayForTimes;
  times: EntryTimes | null;
  labourCategoryId: string | null;
}): DayMark {
  const { day, times } = input;
  const kept: OvertimeInput[] = day.overtime.map((line) =>
    line.fromTimes
      ? {
          labourCategoryId: line.labourCategoryId,
          ratePerHour: line.ratePerHour,
          fromTimes: true,
        }
      : {
          labourCategoryId: line.labourCategoryId,
          hours: line.hours,
          ratePerHour: line.ratePerHour,
        },
  );
  const overtime: OvertimeInput[] =
    kept.length === 0 && times != null
      ? [{ labourCategoryId: input.labourCategoryId, fromTimes: true }]
      : kept;
  return {
    labourId: day.labourId,
    status: day.status,
    isPaidLeave: day.isPaidLeave,
    shift: day.shift,
    checkIn: times?.checkIn ?? null,
    checkOut: times?.checkOut ?? null,
    breakMinutes: times?.breakMinutes ?? null,
    overtime,
  };
}
