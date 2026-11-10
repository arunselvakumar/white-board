import { z } from "zod";

import {
  isRupees,
  paiseToRupees,
  rupeesToPaise,
} from "@/components/money/money-input";
import {
  DEFAULT_BREAK_MINUTES,
  DEFAULT_WORKING_HOURS,
  MAX_BREAK_MINUTES,
  endsNextDay,
  hoursFromTimes,
  spanMinutes,
} from "@/src/labour/domain/wages";
import type {
  AttendanceStatus,
  LabourSheet,
  LabourSheetRow,
  MarkLabourDayInput,
} from "@/src/queries/labour-attendance";

/** The status buttons, in tap order. */
export const STATUS_OPTIONS: {
  value: AttendanceStatus;
  label: string;
  short: string;
}[] = [
  { value: "present", label: "Present", short: "P" },
  { value: "half_day", label: "Half Day", short: "½" },
  { value: "absent", label: "Absent", short: "A" },
  { value: "on_leave", label: "Leave", short: "Leave" },
  { value: "holiday", label: "Holiday", short: "Holiday" },
];

export const STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
  on_leave: "On Leave",
  holiday: "Holiday",
};

/** The free shift label offered on the screen (`modules/08` decisions). */
export const SHIFT_OPTIONS = [
  "General",
  "Shift 1",
  "Shift 2",
  "Shift 3",
] as const;

export const NO_SHIFT = "none";

const HOURS_RE = /^\d{1,2}(\.\d{1,2})?$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const MINUTES_RE = /^\d{1,3}$/;

function isHours(value: string): boolean {
  const hours = value.trim();
  return HOURS_RE.test(hours) && Number(hours) > 0 && Number(hours) <= 24;
}

const overtimeLineSchema = z
  .object({
    labourCategoryId: z.string(),
    hours: z.string(),
    /** Rupees; empty means the labourer's overtime wage. */
    rate: z
      .string()
      .trim()
      .refine(
        (value) => value === "" || isRupees(value),
        "Enter a rate in rupees.",
      ),
    /**
     * The hours follow the row's check-in, check-out and break (ADR
     * CM-0011); the server works them out, so they are not checked here.
     */
    fromTimes: z.boolean(),
  })
  .refine((line) => line.fromTimes || isHours(line.hours), {
    message: "Hours: more than 0, at most 24.",
    path: ["hours"],
  });

const STATUS_VALUES = [
  "",
  "present",
  "half_day",
  "absent",
  "on_leave",
  "holiday",
] as const;

export const TIMES_FIELDS = ["checkIn", "checkOut", "breakMinutes"] as const;
export type TimesField = (typeof TIMES_FIELDS)[number];
export type TimesIssues = Partial<Record<TimesField, string>>;

/** Only a Present or Half Day can have check-in and check-out (ADR CM-0011). */
export function isTimedStatus(status: AttendanceStatus | ""): boolean {
  return status === "present" || status === "half_day";
}

type TimesDraft = {
  status: AttendanceStatus | "";
  /** `HH:MM`, or "" for none. */
  checkIn: string;
  checkOut: string;
  /** Whole minutes as typed; "" is the default hour. */
  breakMinutes: string;
};

/** The break a row's times are worked out with: blank is 60 minutes. */
export function breakOf(draft: Pick<TimesDraft, "breakMinutes">): number {
  const typed = draft.breakMinutes.trim();
  return typed === "" ? DEFAULT_BREAK_MINUTES : Number(typed);
}

/**
 * What is wrong with a row's times, by field, in the server's words (ADR
 * CM-0011): times only on Present / Half Day, `HH:MM`, a check-out needs a
 * check-in and differs from it, and the break is 0–720 whole minutes and
 * shorter than the time between them.
 */
export function timesIssues(draft: TimesDraft): TimesIssues {
  const issues: TimesIssues = {};
  const checkIn = draft.checkIn.trim();
  const checkOut = draft.checkOut.trim();
  if (checkIn === "" && checkOut === "") return issues;
  if (draft.status !== "" && !isTimedStatus(draft.status)) {
    issues.checkIn =
      "Check-in and check-out are only for a Present or Half Day.";
    return issues;
  }
  if (checkIn !== "" && !TIME_RE.test(checkIn))
    issues.checkIn = "Enter a time as HH:MM, from 00:00 to 23:59.";
  if (checkOut !== "" && !TIME_RE.test(checkOut))
    issues.checkOut = "Enter a time as HH:MM, from 00:00 to 23:59.";
  if (checkIn === "") {
    issues.checkIn = "Enter the check-in time before the check-out.";
    return issues;
  }
  if (checkOut !== "" && checkOut === checkIn)
    issues.checkOut = "Check-out cannot be the same time as check-in.";
  const typed = draft.breakMinutes.trim();
  if (
    typed !== "" &&
    (!MINUTES_RE.test(typed) || Number(typed) > MAX_BREAK_MINUTES)
  )
    issues.breakMinutes = `The break is whole minutes from 0 to ${String(MAX_BREAK_MINUTES)}.`;
  else if (
    checkOut !== "" &&
    issues.checkIn == null &&
    issues.checkOut == null &&
    breakOf(draft) >= spanMinutes(checkIn, checkOut)
  )
    issues.breakMinutes =
      "The break must be shorter than the time from check-in to check-out.";
  return issues;
}

const rowSchema = z
  .object({
    labourId: z.string(),
    status: z.enum(STATUS_VALUES),
    isPaidLeave: z.boolean(),
    shift: z.string(),
    checkIn: z.string(),
    checkOut: z.string(),
    breakMinutes: z.string(),
    overtime: z.array(overtimeLineSchema),
  })
  .superRefine((row, ctx) => {
    if (row.status === "absent" && row.overtime.length > 0)
      ctx.addIssue({
        code: "custom",
        message: "An Absent Labour cannot have overtime.",
        path: ["overtime"],
      });
    for (const [field, message] of Object.entries(timesIssues(row)))
      ctx.addIssue({ code: "custom", message, path: [field] });
  });

export const labourSheetFormSchema = z.object({ rows: z.array(rowSchema) });

export type OvertimeLineDraft = z.infer<typeof overtimeLineSchema>;
export type LabourRowDraft = z.infer<typeof rowSchema>;
export type LabourSheetFormValues = z.infer<typeof labourSheetFormSchema>;

/** The Labour's working hours a day, decimal hours. */
export function workingHoursOf(row: LabourSheetRow): string {
  return row.workingHoursPerDay ?? DEFAULT_WORKING_HOURS;
}

export type TimesSummary = {
  /** Decimal hours: check-out − check-in − break. */
  worked: string;
  /** Decimal hours beyond the working hours, or null. */
  extra: string | null;
  workingHours: string;
  /** Check-out falls on the next day (a night shift). */
  nextDay: boolean;
  /** Worked less than the working hours; pay does not change. */
  short: boolean;
};

/**
 * The live "Worked" preview of a row with both times, worked out with the
 * same domain rule the server uses; null while the times are incomplete or
 * wrong.
 */
export function timesSummary(
  row: LabourSheetRow,
  draft: TimesDraft,
): TimesSummary | null {
  if (!isTimedStatus(draft.status)) return null;
  const checkIn = draft.checkIn.trim();
  const checkOut = draft.checkOut.trim();
  if (checkIn === "" || checkOut === "") return null;
  if (Object.keys(timesIssues(draft)).length > 0) return null;
  const workingHours = workingHoursOf(row);
  try {
    const { worked, extra } = hoursFromTimes({
      checkIn,
      checkOut,
      breakMinutes: breakOf(draft),
      workingHours,
    });
    return {
      worked,
      extra,
      workingHours,
      nextDay: endsNextDay(checkIn, checkOut),
      short: Number(worked) < Number(workingHours),
    };
  } catch {
    // BREAK_TOO_LONG / BREAK_INVALID / WORKING_HOURS_INVALID: no preview.
    return null;
  }
}

/**
 * The overtime lines once the row's times or status changed (ADR CM-0011).
 * Kept simple and predictable:
 *
 * - With extra time, the line marked `fromTimes` takes the new hours and
 *   keeps the category and rate the supervisor chose.
 * - Without extra time (no check-out, a short day, wrong times), that line
 *   drops out.
 * - A new `fromTimes` line (the Labour's category and overtime wage) is only
 *   added when the row has no overtime lines at all, so hours typed by hand
 *   are never counted twice. Editing the line's hours turns it into an
 *   ordinary line (see `OvertimeLines`), and removing it keeps it away until
 *   the times change again.
 *
 * This runs only when the times or status change, never on render, so a
 * removed line stays removed while the supervisor works on other fields.
 */
export function withTimesOvertime(
  row: LabourSheetRow,
  draft: LabourRowDraft,
): OvertimeLineDraft[] {
  const extra = timesSummary(row, draft)?.extra ?? null;
  if (extra == null) return draft.overtime.filter((line) => !line.fromTimes);
  if (draft.overtime.some((line) => line.fromTimes))
    return draft.overtime.map((line) =>
      line.fromTimes ? { ...line, hours: extra } : line,
    );
  if (draft.overtime.length > 0) return draft.overtime;
  return [{ ...newOvertimeLine(row), hours: extra, fromTimes: true }];
}

export type TimesPatch = Partial<
  Pick<LabourRowDraft, "checkIn" | "checkOut" | "breakMinutes">
>;

/**
 * The row with new times: a first check-in brings the default 60-minute
 * break, and the `fromTimes` overtime line follows.
 */
export function withTimes(
  row: LabourSheetRow,
  draft: LabourRowDraft,
  patch: TimesPatch,
): LabourRowDraft {
  const next = { ...draft, ...patch };
  if (
    next.checkIn.trim() !== "" &&
    draft.checkIn.trim() === "" &&
    next.breakMinutes.trim() === ""
  )
    next.breakMinutes = String(DEFAULT_BREAK_MINUTES);
  return { ...next, overtime: withTimesOvertime(row, next) };
}

/**
 * The row with a new status: Paid Leave only on Leave, no overtime on
 * Absent, and no times (nor the overtime from them) on Absent, Leave or
 * Holiday.
 */
export function withStatus(
  row: LabourSheetRow,
  draft: LabourRowDraft,
  status: AttendanceStatus,
): LabourRowDraft {
  const timed = isTimedStatus(status);
  const next: LabourRowDraft = {
    ...draft,
    status,
    isPaidLeave: status === "on_leave" ? draft.isPaidLeave : false,
    checkIn: timed ? draft.checkIn : "",
    checkOut: timed ? draft.checkOut : "",
    breakMinutes: timed ? draft.breakMinutes : "",
  };
  if (status === "absent") return { ...next, overtime: [] };
  return { ...next, overtime: withTimesOvertime(row, next) };
}

/** "Copy yesterday" for one row: status, Paid Leave, shift and times. */
export function withYesterday(
  row: LabourSheetRow,
  draft: LabourRowDraft,
): LabourRowDraft {
  const yesterday = row.yesterday;
  if (yesterday == null) return draft;
  const next = {
    ...withStatus(row, draft, yesterday.status),
    isPaidLeave: yesterday.status === "on_leave" && yesterday.isPaidLeave,
    shift: yesterday.shift ?? "",
  };
  if (!isTimedStatus(yesterday.status)) return next;
  return withTimes(row, next, {
    checkIn: yesterday.checkIn ?? "",
    checkOut: yesterday.checkOut ?? "",
    breakMinutes:
      yesterday.breakMinutes == null ? "" : String(yesterday.breakMinutes),
  });
}

/** A row as the server has it (or unmarked), before any pre-fill. */
export function savedDraft(row: LabourSheetRow): LabourRowDraft {
  const day = row.attendance;
  if (day == null)
    return {
      labourId: row.labourId,
      status: "",
      isPaidLeave: false,
      shift: "",
      checkIn: "",
      checkOut: "",
      breakMinutes: "",
      overtime: [],
    };
  return {
    labourId: row.labourId,
    status: day.status,
    isPaidLeave: day.isPaidLeave,
    shift: day.shift ?? "",
    checkIn: day.checkIn ?? "",
    checkOut: day.checkOut ?? "",
    breakMinutes: day.breakMinutes == null ? "" : String(day.breakMinutes),
    overtime: day.overtime.map((line) => ({
      labourCategoryId: line.labourCategoryId ?? "",
      hours: line.hours,
      rate: line.ratePerHour == null ? "" : paiseToRupees(line.ratePerHour),
      fromTimes: line.fromTimes,
    })),
  };
}

/** The form's starting values: saved rows, and weekly holidays pre-filled Holiday. */
export function labourSheetDefaults(sheet: LabourSheet): LabourSheetFormValues {
  return {
    rows: sheet.labourers.map((row) => {
      const saved = savedDraft(row);
      if (row.attendance == null && row.canMark && row.isWeeklyHoliday)
        return { ...saved, status: "holiday" };
      return saved;
    }),
  };
}

function normalised(row: LabourRowDraft) {
  const timed = isTimedStatus(row.status);
  const checkIn = timed ? row.checkIn.trim() : "";
  return {
    status: row.status,
    isPaidLeave: row.status === "on_leave" && row.isPaidLeave,
    shift: row.shift.trim(),
    checkIn,
    checkOut: timed ? row.checkOut.trim() : "",
    // No break without a check-in; a blank break is the default hour.
    breakMinutes: checkIn === "" ? "" : String(breakOf(row)),
    overtime: row.overtime.map((line) => ({
      labourCategoryId: line.labourCategoryId,
      // A `fromTimes` line's hours follow the times, which are compared above.
      hours:
        line.fromTimes || line.hours.trim() === ""
          ? ""
          : String(Number(line.hours)),
      rate: line.rate.trim() === "" ? "" : String(rupeesToPaise(line.rate)),
      fromTimes: line.fromTimes,
    })),
  };
}

/** Whether the row differs from what the server has (a marked status is needed to save). */
export function isRowDirty(
  row: LabourSheetRow,
  draft: LabourRowDraft,
): boolean {
  if (!row.canMark || draft.status === "") return false;
  return (
    JSON.stringify(normalised(draft)) !==
    JSON.stringify(normalised(savedDraft(row)))
  );
}

/** A new overtime line: the Labour's category, empty hours, their OT wage. */
export function newOvertimeLine(row: LabourSheetRow): OvertimeLineDraft {
  return {
    labourCategoryId: row.labourCategory?.id ?? "",
    hours: "",
    rate:
      row.overtimeWagePerHour == null
        ? ""
        : paiseToRupees(row.overtimeWagePerHour),
    fromTimes: false,
  };
}

/**
 * The save body: only dirty rows, each with its loaded `updatedAt` in
 * `expected` when it was already marked (the review rule for multi-row saves).
 */
export function labourMarkPayload(
  projectId: string,
  date: string,
  sheet: LabourSheet,
  values: LabourSheetFormValues,
): MarkLabourDayInput | null {
  const marks: MarkLabourDayInput["marks"] = [];
  const expected: Record<string, string> = {};
  sheet.labourers.forEach((row, index) => {
    const draft = values.rows[index];
    if (draft == null || draft.status === "" || !isRowDirty(row, draft)) return;
    const timed = isTimedStatus(draft.status);
    const checkIn = timed ? draft.checkIn.trim() : "";
    const checkOut = timed ? draft.checkOut.trim() : "";
    marks.push({
      labourId: row.labourId,
      status: draft.status,
      ...(draft.status === "on_leave"
        ? { isPaidLeave: draft.isPaidLeave }
        : {}),
      shift: draft.shift.trim() === "" ? null : draft.shift.trim(),
      checkIn: checkIn === "" ? null : checkIn,
      checkOut: checkOut === "" ? null : checkOut,
      ...(checkIn === "" ? {} : { breakMinutes: breakOf(draft) }),
      overtime: draft.overtime.map((line) => ({
        labourCategoryId:
          line.labourCategoryId === "" ? null : line.labourCategoryId,
        // The server works out a `fromTimes` line's hours (ADR CM-0011).
        ...(line.fromTimes
          ? { fromTimes: true }
          : { hours: line.hours.trim() }),
        ...(line.rate.trim() === ""
          ? {}
          : { ratePerHour: rupeesToPaise(line.rate) }),
      })),
    });
    if (row.attendance != null)
      expected[row.labourId] = row.attendance.updatedAt;
  });
  if (marks.length === 0) return null;
  return {
    projectId,
    date,
    marks,
    ...(Object.keys(expected).length > 0 ? { expected } : {}),
  };
}

/** Paise a draft day would earn, for the preview (null without wages). */
export function previewEarned(
  row: LabourSheetRow,
  draft: LabourRowDraft,
  date: string,
): number | null {
  if (draft.status === "") return null;
  const halves =
    draft.status === "present"
      ? 2
      : draft.status === "half_day"
        ? 1
        : draft.status === "on_leave"
          ? draft.isPaidLeave
            ? 2
            : 0
          : draft.status === "holiday"
            ? row.wageType === "monthly"
              ? 2
              : 0
            : 0;
  let day: number | null = null;
  if (row.wageType === "daily" && row.wagePerDay != null)
    day = Math.round((row.wagePerDay * halves) / 2);
  if (row.wageType === "monthly" && row.wagePerMonth != null) {
    const [year = 0, month = 0] = date.split("-").map(Number);
    const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
    day = Math.round((row.wagePerMonth * halves) / (2 * days));
  }
  if (day == null) return null;
  let overtime = 0;
  const extra = timesSummary(row, draft)?.extra ?? null;
  for (const line of draft.overtime) {
    if (line.fromTimes && extra == null) continue;
    const hours = Number(line.fromTimes ? extra : line.hours);
    const rate =
      line.rate.trim() === ""
        ? row.overtimeWagePerHour
        : rupeesToPaise(line.rate);
    if (!Number.isFinite(hours) || rate == null) return null;
    overtime += Math.round(hours * rate);
  }
  return day + overtime;
}
