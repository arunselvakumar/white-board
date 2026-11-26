import { addDays, addMonths, type IsoDate } from "./dates";
import { conflict, forbidden, invalid } from "./errors";

export const ATTENDANCE_STATUSES = ["present", "absent", "leave"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const COLLECTED_BY_KINDS = [
  "father",
  "mother",
  "authorised_pickup",
  "other",
] as const;
export type CollectedByKind = (typeof COLLECTED_BY_KINDS)[number];

/** Who changes a day: the Preschool role names. */
export type DayEditorRole = "owner" | "centre_head" | "teacher" | "parent";

/** "HH:mm", 00:00–23:59. */
export function isClockTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

/**
 * Whether the actor may change attendance or a Daily Report on `date`: never
 * a future date; a Teacher only today and yesterday; the Owner and Centre
 * Heads any past date. Parents never.
 */
export function canEditDay(
  role: DayEditorRole,
  date: IsoDate,
  today: IsoDate,
): boolean {
  if (date > today || role === "parent") return false;
  if (role === "teacher") return date >= addDays(today, -1);
  return true;
}

/** 400 `DATE_IN_FUTURE` or 403 `DATE_LOCKED` unless `canEditDay`. */
export function assertEditableDay(
  role: DayEditorRole,
  date: IsoDate,
  today: IsoDate,
): void {
  if (date > today)
    throw invalid("DATE_IN_FUTURE", "You cannot record a day that is ahead.");
  if (!canEditDay(role, date, today))
    throw forbidden(
      "DATE_LOCKED",
      "Teachers can change only today and yesterday. Ask the Centre Head.",
    );
}

/** The day's mark, with clock times in India. */
export type AttendanceMark = {
  status: AttendanceStatus;
  checkInTime: string | null;
  droppedBy: string | null;
  checkOutTime: string | null;
  collectedByKind: CollectedByKind | null;
  collectedByName: string | null;
  collectedByPickupId: string | null;
  note: string | null;
};

const NOT_COLLECTED = {
  checkOutTime: null,
  collectedByKind: null,
  collectedByName: null,
  collectedByPickupId: null,
  note: null,
} as const;

/**
 * A status set from the register. Present keeps the day's times and, on
 * today, checks the Child in at `nowTime` if they were not; absent and leave
 * clear every time.
 */
export function markStatus(
  existing: AttendanceMark | null,
  status: AttendanceStatus,
  day: { isToday: boolean; nowTime: string },
): AttendanceMark {
  if (status !== "present")
    return {
      status,
      checkInTime: null,
      droppedBy: null,
      ...NOT_COLLECTED,
    };
  if (existing?.status === "present") return existing;
  return {
    status,
    checkInTime: day.isToday ? day.nowTime : null,
    droppedBy: null,
    ...NOT_COLLECTED,
  };
}

/**
 * The clock time for a check-in or check-out: `time` if given, else now on
 * today. Another day needs the time; a time later than now on today is refused.
 */
export function clockTimeFor(
  time: string | undefined,
  day: { isToday: boolean; nowTime: string },
): string {
  if (time == null) {
    if (!day.isToday)
      throw invalid("TIME_REQUIRED", "Enter the time for a past day.");
    return day.nowTime;
  }
  if (!isClockTime(time))
    throw invalid("TIME_INVALID", "Enter the time as HH:mm.");
  if (day.isToday && time > day.nowTime)
    throw invalid("TIME_IN_FUTURE", "That time has not come yet.");
  return time;
}

/** Present with a check-in time; a later check-out is kept, an earlier one refused. */
export function checkIn(
  existing: AttendanceMark | null,
  time: string,
  droppedBy: string | null,
): AttendanceMark {
  const kept =
    existing?.status === "present"
      ? existing
      : { status: "present" as const, droppedBy: null, ...NOT_COLLECTED };
  if (kept.checkOutTime != null && kept.checkOutTime < time)
    throw invalid(
      "CHECK_OUT_BEFORE_CHECK_IN",
      "The check-in cannot be after the check-out.",
    );
  return {
    ...kept,
    checkInTime: time,
    droppedBy: droppedBy ?? kept.droppedBy,
  };
}

export type CollectedByInput = {
  kind: CollectedByKind;
  pickupId?: string | null;
  name?: string | null;
  note?: string | null;
};

export type ChildCollectors = {
  fatherName: string | null;
  motherName: string | null;
  pickups: readonly { id: string; name: string }[];
};

function blank(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Who collected the Child. A Parent's name comes from the Child's record and
 * must be on it; an Authorised Pickup must be one of the Child's; anyone else
 * needs their name and a note saying why (the safety rule).
 */
export function collectedBy(
  input: CollectedByInput,
  child: ChildCollectors,
): Pick<
  AttendanceMark,
  "collectedByKind" | "collectedByName" | "collectedByPickupId" | "note"
> {
  const note = blank(input.note);
  if (input.kind === "father" || input.kind === "mother") {
    const name = input.kind === "father" ? child.fatherName : child.motherName;
    if (name == null)
      throw invalid(
        "COLLECTOR_NOT_ON_RECORD",
        `The Child's record has no ${input.kind}. Choose who collected them.`,
      );
    return {
      collectedByKind: input.kind,
      collectedByName: name,
      collectedByPickupId: null,
      note,
    };
  }
  if (input.kind === "authorised_pickup") {
    const pickup = child.pickups.find((entry) => entry.id === input.pickupId);
    if (pickup == null)
      throw invalid(
        "PICKUP_NOT_AUTHORISED",
        "Choose one of the Child's Authorised Pickups.",
      );
    return {
      collectedByKind: input.kind,
      collectedByName: pickup.name,
      collectedByPickupId: pickup.id,
      note,
    };
  }
  const name = blank(input.name);
  if (name == null || note == null)
    throw invalid(
      "COLLECTED_BY_NOTE_REQUIRED",
      "Someone who is not a Parent or an Authorised Pickup needs their name and a note.",
    );
  return {
    collectedByKind: "other",
    collectedByName: name,
    collectedByPickupId: null,
    note,
  };
}

/** Checks the Child out: they must be present and checked in, and leave after arriving. */
export function checkOut(
  existing: AttendanceMark | null,
  time: string,
  collector: ReturnType<typeof collectedBy>,
): AttendanceMark {
  if (existing?.status !== "present")
    throw conflict("NOT_PRESENT", "The Child is not marked present.");
  if (existing.checkInTime == null)
    throw conflict("NOT_CHECKED_IN", "Check the Child in first.");
  if (time < existing.checkInTime)
    throw invalid(
      "CHECK_OUT_BEFORE_CHECK_IN",
      "The check-out cannot be before the check-in.",
    );
  return { ...existing, ...collector, checkOutTime: time };
}

export function undoCheckOut(existing: AttendanceMark | null): AttendanceMark {
  if (existing?.checkOutTime == null)
    throw conflict("NOT_CHECKED_OUT", "The Child has not been checked out.");
  return { ...existing, ...NOT_COLLECTED };
}

export type AttendanceCounts = {
  rosterSize: number;
  present: number;
  absent: number;
  leave: number;
  notMarked: number;
  checkedOut: number;
};

export function countMarks(
  rosterSize: number,
  marks: readonly Pick<AttendanceMark, "status" | "checkOutTime">[],
): AttendanceCounts {
  const counts = { present: 0, absent: 0, leave: 0, checkedOut: 0 };
  for (const mark of marks) {
    counts[mark.status] += 1;
    if (mark.checkOutTime != null) counts.checkedOut += 1;
  }
  return {
    rosterSize,
    ...counts,
    notMarked: Math.max(
      0,
      rosterSize - counts.present - counts.absent - counts.leave,
    ),
  };
}

/** "YYYY-MM". */
export function isMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Every date of a month, first to last. */
export function daysOfMonth(month: string): IsoDate[] {
  const first = `${month}-01`;
  const last = addDays(addMonths(first, 1), -1);
  const days: IsoDate[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) days.push(day);
  return days;
}
