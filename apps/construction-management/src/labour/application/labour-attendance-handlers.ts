import {
  addDays,
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";
import type { ListCursor } from "@/src/shared-kernel/list-cursor";

import {
  assertDistinctLabourers,
  priceDay,
  withPaidLeave,
  type DayMark,
  type PricedDay,
  type WageCard,
} from "../domain/labour-attendance";
import { monthOf } from "../domain/ledger";
import {
  ATTENDANCE_STATUSES,
  datesBetween,
  hoursFromTimes,
  hoursInHundredths,
  weekdayOf,
  type AttendanceStatus,
  type Weekday,
} from "../domain/wages";
import type {
  LabourCategoryDirectory,
  ProjectDirectory,
  SupervisorDirectory,
} from "./directories";

/** A labourer as attendance needs them: who, where they report, what they earn. */
export type AttendanceLabourer = {
  id: string;
  name: string;
  labourCode: string | null;
  isActive: boolean;
  labourCategoryId: string | null;
  supervisorId: string | null;
  weeklyHolidays: Weekday[];
  /** The current wages; a new or re-marked day is priced from these. */
  card: WageCard;
};

/** A marked day as stored: the live row, its snapshot and its overtime lines. */
export type StoredLabourDay = PricedDay & {
  id: string;
  workspaceId: string;
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

/** One row of a save: a new day (`expectedUpdatedAt` null) or a change. */
export type LabourDayWrite = {
  id: string;
  day: PricedDay;
  expectedUpdatedAt: Date | null;
};

/** `on_leave` is every leave day; `paid_leave` only the paid ones. */
export type LabourDayStatusFilter = AttendanceStatus | "paid_leave";

export type LabourDayListParams = {
  workspaceId: string;
  projectId: string;
  from?: CalendarDate;
  to?: CalendarDate;
  labourId?: string;
  supervisorId?: string;
  status?: LabourDayStatusFilter;
  limit: number;
  /** Newest date first; the cursor's `createdAt` carries the attendance date. */
  after?: ListCursor;
  before?: ListCursor;
};

/**
 * Where labour attendance lives (Prisma in infrastructure). `save` and
 * `clear` are one transaction each: rows, overtime lines, ledger reversal
 * and reposting, and the audit events (ADR CM-0004). A stale
 * `expectedUpdatedAt`, or a second live row for a labourer and date, is 409
 * `ATTENDANCE_CHANGED` with `details.labourId`.
 */
export type LabourAttendanceStore = {
  /** Today in the Company's time zone. */
  today(workspaceId: string): Promise<CalendarDate>;
  /** Live (not deleted) labourers among `ids`, active or not. */
  labourers(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, AttendanceLabourer>>;
  /** The Project each labourer worked in on `date` (transfer history). */
  projectsOn(
    workspaceId: string,
    ids: readonly string[],
    date: CalendarDate,
  ): Promise<Map<string, string>>;
  /** Active labourers on the Project on `date`, by name. */
  labourersOn(
    workspaceId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<AttendanceLabourer[]>;
  /** Live rows of these labourers on `date`, in any Project. */
  daysOf(
    workspaceId: string,
    labourIds: readonly string[],
    date: CalendarDate,
  ): Promise<StoredLabourDay[]>;
  findById(workspaceId: string, id: string): Promise<StoredLabourDay | null>;
  /** Live rows of a Project between two dates (inclusive), oldest first. */
  daysBetween(
    workspaceId: string,
    projectId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<StoredLabourDay[]>;
  list(
    params: LabourDayListParams,
  ): Promise<{ items: StoredLabourDay[]; total: number; hasMore: boolean }>;
  /**
   * Writes every day in one transaction, after locking the labourers' rows
   * (404 `LABOUR_NOT_FOUND` when one was deleted meanwhile).
   */
  save(input: {
    workspaceId: string;
    writes: readonly LabourDayWrite[];
    /** Audit wording: a mark, or "Mark Paid Leave". */
    reason: "marked" | "paid_leave";
    by: string;
    now: Date;
  }): Promise<void>;
  clear(input: {
    workspaceId: string;
    days: readonly { day: StoredLabourDay; expectedUpdatedAt: Date }[];
    by: string;
    now: Date;
  }): Promise<void>;
  /** Names of labourers by id, including inactive and deleted ones. */
  labourNames(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, { name: string; labourCode: string | null }>>;
  /** Live, enabled Labour Categories for the overtime picker, by name. */
  categoryOptions(workspaceId: string): Promise<{ id: string; name: string }[]>;
};

/** Who is marking, for the back-dated guard. */
export type LabourAttendanceActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
};

/** The kernel's back-dated entry policy, `module = labour_attendance`. */
export type LabourAttendanceBackdatedGuard = {
  assert(
    action: "create" | "edit",
    actor: LabourAttendanceActor,
    date: CalendarDate,
  ): Promise<void>;
};

type Ref = { id: string; name: string };

export type LabourOvertimeReadModel = {
  labourCategoryId: string | null;
  /** Null when there is no category, or it was deleted from Masters. */
  labourCategoryName: string | null;
  /** Decimal hours. */
  hours: string;
  ratePerHour: number;
  amount: number;
  /** Hours worked out from the day's times (ADR CM-0011). */
  fromTimes: boolean;
};

export type LabourAttendanceDayReadModel = {
  id: string;
  projectId: string;
  labourId: string;
  labourName: string;
  labourCode: string | null;
  date: CalendarDate;
  status: AttendanceStatus;
  isPaidLeave: boolean;
  shift: string | null;
  supervisor: Ref | null;
  checkIn: string | null;
  checkOut: string | null;
  breakMinutes: number | null;
  /** Snapshot of the Labour's working hours a day. */
  workingHours: string;
  /** check-out − check-in − break; null without both times. */
  workedHours: string | null;
  wageType: WageCard["wageType"];
  /** Snapshot: wage per day or per month the day was priced at. */
  wageRate: number;
  /** What the day pays before overtime. */
  earned: number;
  overtime: LabourOvertimeReadModel[];
  overtimeHours: string;
  overtimeAmount: number;
  /** earned + overtime. */
  total: number;
  createdAt: Date;
  updatedAt: Date;
};

export type LabourSheetRowReadModel = {
  labourId: string;
  name: string;
  labourCode: string | null;
  labourCategory: Ref | null;
  supervisor: Ref | null;
  weeklyHolidays: number[];
  wageType: WageCard["wageType"] | null;
  wagePerDay: number | null;
  wagePerMonth: number | null;
  overtimeWagePerHour: number | null;
  /** Decimal hours a day; null for a labourer no longer listed. */
  workingHoursPerDay: string | null;
  /** Active and on this Project on the date: the row can be marked. */
  canMark: boolean;
  isActive: boolean;
  onProject: boolean;
  /** The date is one of the labourer's weekly holidays. */
  isWeeklyHoliday: boolean;
  /** Pre-fill for an unmarked row: Holiday on a weekly holiday, else yesterday's status. */
  suggestedStatus: AttendanceStatus | null;
  /** The previous day's mark ("Copy yesterday"), in any Project. */
  yesterday: {
    status: AttendanceStatus;
    isPaidLeave: boolean;
    shift: string | null;
    checkIn: string | null;
    checkOut: string | null;
    breakMinutes: number | null;
  } | null;
  attendance: LabourAttendanceDayReadModel | null;
};

export type LabourSheetReadModel = {
  projectId: string;
  date: CalendarDate;
  labourers: LabourSheetRowReadModel[];
  /** For the overtime line picker. */
  labourCategories: Ref[];
  /** Supervisors of the listed labourers, for the filter. */
  supervisors: Ref[];
  totals: {
    marked: number;
    present: number;
    halfDay: number;
    absent: number;
    onLeave: number;
    holiday: number;
    earned: number;
    overtimeAmount: number;
  };
};

/** P, H (half day), A, L (unpaid leave), PL (paid leave), HO (holiday). */
export type DayCode = "P" | "H" | "A" | "L" | "PL" | "HO";

export type LabourMonthTotals = {
  present: number;
  halfDay: number;
  absent: number;
  leave: number;
  paidLeave: number;
  holiday: number;
  overtimeHours: string;
  earned: number;
  overtimeAmount: number;
  total: number;
};

export type LabourMonthReadModel = {
  projectId: string;
  month: string;
  from: CalendarDate;
  to: CalendarDate;
  dates: CalendarDate[];
  labourers: {
    labourId: string;
    name: string;
    labourCode: string | null;
    /** Marked dates only. */
    days: {
      date: CalendarDate;
      attendanceId: string;
      code: DayCode;
      status: AttendanceStatus;
      isPaidLeave: boolean;
      overtimeHours: string;
      earned: number;
      overtimeAmount: number;
    }[];
    totals: LabourMonthTotals;
  }[];
  /** Per date, headcount by code (marked dates only). */
  dayCounts: {
    date: CalendarDate;
    present: number;
    halfDay: number;
    marked: number;
  }[];
  totals: LabourMonthTotals;
};

export type MarkLabourDayInput = {
  actor: LabourAttendanceActor;
  projectId: string;
  date: string;
  marks: readonly DayMark[];
  /**
   * The `updatedAt` of each already-marked row this save changes, by
   * labourer. A marked row without an entry (or with a stale one) is 409
   * `ATTENDANCE_CHANGED`, so a stale screen never overwrites a newer mark.
   */
  expected?: Readonly<Record<string, Date>>;
  /** `labour.attendance` create on the Project (new days). */
  canCreate: boolean;
  /** `labour.attendance` update on the Project (re-marking). */
  canEdit: boolean;
};

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** The longest range the recorded list reads at once. */
export const MAX_RANGE_DAYS = 366;

/** Hundredths of an hour as a decimal string (`150` → `"1.5"`). */
export function formatHundredths(value: number): string {
  const whole = Math.floor(value / 100);
  const fraction = value % 100;
  if (fraction === 0) return String(whole);
  return `${String(whole)}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

export function dayCode(
  status: AttendanceStatus,
  isPaidLeave: boolean,
): DayCode {
  switch (status) {
    case "present":
      return "P";
    case "half_day":
      return "H";
    case "absent":
      return "A";
    case "on_leave":
      return isPaidLeave ? "PL" : "L";
    case "holiday":
      return "HO";
  }
}

function overtimeHundredths(day: PricedDay): number {
  return day.overtime.reduce(
    (sum, line) => sum + hoursInHundredths(line.hours),
    0,
  );
}

function overtimeAmountOf(day: PricedDay): number {
  return day.overtime.reduce((sum, line) => sum + line.amount, 0);
}

/** Hours worked on a day with both times (ADR CM-0011), else null. */
function workedHoursOf(day: PricedDay): string | null {
  if (day.checkIn == null || day.checkOut == null) return null;
  return hoursFromTimes({
    checkIn: day.checkIn,
    checkOut: day.checkOut,
    breakMinutes: day.breakMinutes ?? 0,
    workingHours: day.workingHours,
  }).worked;
}

/** A copy of a domain error with `labourId` (and more) added to its details. */
function forLabourer(
  error: unknown,
  labourId: string,
  extra: Record<string, unknown> = {},
): unknown {
  if (!(error instanceof DomainError)) return error;
  const details =
    error.details != null && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : {};
  return new DomainError(error.code, error.message, {
    kind: error.kind,
    details: { ...details, ...extra, labourId },
  });
}

function rowError(
  code: string,
  message: string,
  kind: DomainError["kind"],
  details: Record<string, unknown>,
): DomainError {
  return new DomainError(code, message, { kind, details });
}

function emptyTotals(): LabourMonthTotals {
  return {
    present: 0,
    halfDay: 0,
    absent: 0,
    leave: 0,
    paidLeave: 0,
    holiday: 0,
    overtimeHours: "0",
    earned: 0,
    overtimeAmount: 0,
    total: 0,
  };
}

/** Adds one day into running totals (overtime hours kept as hundredths). */
function addDay(
  totals: LabourMonthTotals & { hundredths?: number },
  day: StoredLabourDay,
): void {
  switch (dayCode(day.status, day.isPaidLeave)) {
    case "P":
      totals.present += 1;
      break;
    case "H":
      totals.halfDay += 1;
      break;
    case "A":
      totals.absent += 1;
      break;
    case "L":
      totals.leave += 1;
      break;
    case "PL":
      totals.paidLeave += 1;
      break;
    case "HO":
      totals.holiday += 1;
      break;
  }
  const hundredths = (totals.hundredths ?? 0) + overtimeHundredths(day);
  totals.hundredths = hundredths;
  totals.overtimeHours = formatHundredths(hundredths);
  const overtime = overtimeAmountOf(day);
  totals.earned += day.earned;
  totals.overtimeAmount += overtime;
  totals.total += day.earned + overtime;
}

function stripHundredths(
  totals: LabourMonthTotals & { hundredths?: number },
): LabourMonthTotals {
  const { hundredths: _ignored, ...rest } = totals;
  return rest;
}

/**
 * Labour attendance (CM-210, CM-211): mark many labourers' day on a Project
 * in one command, clear days, "Mark Paid Leave", and the marking sheet,
 * recorded list and month grid. Menu access is checked by the route; the
 * create/update split, the back-dated guard and the concurrency check here.
 *
 * A new day is priced from the labourer's current wages. A re-marked day is
 * re-priced from the current wages too (the day changed, so it is a new
 * pricing); days that are not touched keep their snapshot. "Mark Paid
 * Leave" alone keeps the snapshot wage (`withPaidLeave`).
 */
export class LabourAttendanceHandlers {
  constructor(
    private readonly store: LabourAttendanceStore,
    private readonly projects: ProjectDirectory,
    private readonly labourCategories: LabourCategoryDirectory,
    private readonly supervisors: SupervisorDirectory,
    private readonly backdated: LabourAttendanceBackdatedGuard,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  private async assertProject(
    workspaceId: string,
    projectId: string,
  ): Promise<void> {
    const found = await this.projects.find(workspaceId, [projectId]);
    if (!found.has(projectId))
      throw notFound("PROJECT_NOT_FOUND", "This Project was not found.");
  }

  private async assertNotFuture(
    workspaceId: string,
    date: CalendarDate,
  ): Promise<void> {
    const today = await this.store.today(workspaceId);
    if (daysBetween(today, date) > 0)
      throw new DomainError(
        "ATTENDANCE_DATE_IN_FUTURE",
        "Attendance cannot be marked for a future date.",
        { details: { date, today } },
      );
  }

  /** Read models with labour, category and supervisor names. */
  private async readModels(
    workspaceId: string,
    days: readonly StoredLabourDay[],
  ): Promise<LabourAttendanceDayReadModel[]> {
    if (days.length === 0) return [];
    const [names, categories, supervisors] = await Promise.all([
      this.store.labourNames(
        workspaceId,
        days.map((day) => day.labourId),
      ),
      this.labourCategories.find(workspaceId, [
        ...new Set(
          days.flatMap((day) =>
            day.overtime
              .map((line) => line.labourCategoryId)
              .filter((id): id is string => id != null),
          ),
        ),
      ]),
      this.supervisors.find(workspaceId, [
        ...new Set(
          days
            .map((day) => day.supervisorId)
            .filter((id): id is string => id != null),
        ),
      ]),
    ]);
    return days.map((day) => {
      const overtimeAmount = overtimeAmountOf(day);
      const supervisor =
        day.supervisorId == null
          ? undefined
          : supervisors.get(day.supervisorId);
      return {
        id: day.id,
        projectId: day.projectId,
        labourId: day.labourId,
        labourName: names.get(day.labourId)?.name ?? "",
        labourCode: names.get(day.labourId)?.labourCode ?? null,
        date: day.date,
        status: day.status,
        isPaidLeave: day.isPaidLeave,
        shift: day.shift,
        supervisor:
          supervisor == null
            ? null
            : { id: supervisor.id, name: supervisor.name },
        checkIn: day.checkIn,
        checkOut: day.checkOut,
        breakMinutes: day.breakMinutes,
        workingHours: day.workingHours,
        workedHours: workedHoursOf(day),
        wageType: day.wageType,
        wageRate: day.wageRate,
        earned: day.earned,
        overtime: day.overtime.map((line) => ({
          labourCategoryId: line.labourCategoryId,
          labourCategoryName:
            line.labourCategoryId == null
              ? null
              : (categories.get(line.labourCategoryId)?.name ?? null),
          hours: line.hours,
          ratePerHour: line.ratePerHour,
          amount: line.amount,
          fromTimes: line.fromTimes,
        })),
        overtimeHours: formatHundredths(overtimeHundredths(day)),
        overtimeAmount,
        total: day.earned + overtimeAmount,
        createdAt: day.createdAt,
        updatedAt: day.updatedAt,
      };
    });
  }

  /**
   * Marks many labourers' day on a Project in one transaction (CM-210).
   * Every labourer must be live, active and on this Project on that date;
   * a labourer already marked that day needs their row's `updatedAt` in
   * `expected`. Returns the saved rows.
   */
  async markDay(
    input: MarkLabourDayInput,
  ): Promise<LabourAttendanceDayReadModel[]> {
    const { actor } = input;
    const workspaceId = actor.workspaceId;
    const date = assertCalendarDate(input.date.trim(), "DATE_INVALID");
    assertDistinctLabourers(input.marks);
    await this.assertNotFuture(workspaceId, date);
    await this.assertProject(workspaceId, input.projectId);

    const ids = input.marks.map((mark) => mark.labourId);
    const [labourers, projectsOn, existingDays] = await Promise.all([
      this.store.labourers(workspaceId, ids),
      this.store.projectsOn(workspaceId, ids, date),
      this.store.daysOf(workspaceId, ids, date),
    ]);
    for (const mark of input.marks) {
      const labourer = labourers.get(mark.labourId);
      if (labourer == null)
        throw rowError(
          "LABOUR_NOT_FOUND",
          "This Labour was not found.",
          "not_found",
          { labourId: mark.labourId },
        );
      if (!labourer.isActive)
        throw rowError(
          "LABOUR_INACTIVE",
          `${labourer.name} is inactive. Activate them in Masters → Labours to mark attendance.`,
          "invalid",
          { labourId: labourer.id },
        );
      const on = projectsOn.get(labourer.id) ?? null;
      if (on !== input.projectId)
        throw rowError(
          "LABOUR_NOT_ON_PROJECT",
          `${labourer.name} was not on this Project on ${date}.`,
          "invalid",
          { labourId: labourer.id, projectId: on },
        );
    }

    // Overtime categories and explicit supervisors must be live.
    const categoryIds = new Set<string>();
    const supervisorIds = new Set<string>();
    for (const mark of input.marks) {
      for (const line of mark.overtime ?? [])
        if (line.labourCategoryId != null)
          categoryIds.add(line.labourCategoryId);
      if (mark.supervisorId != null) supervisorIds.add(mark.supervisorId);
      const own = labourers.get(mark.labourId)?.supervisorId;
      if (mark.supervisorId === undefined && own != null)
        supervisorIds.add(own);
    }
    const [categories, supervisors] = await Promise.all([
      this.labourCategories.find(workspaceId, [...categoryIds]),
      this.supervisors.find(workspaceId, [...supervisorIds]),
    ]);
    for (const mark of input.marks) {
      for (const line of mark.overtime ?? [])
        if (
          line.labourCategoryId != null &&
          !categories.has(line.labourCategoryId)
        )
          throw rowError(
            "LABOUR_CATEGORY_NOT_FOUND",
            "An overtime line's Labour Category was not found.",
            "invalid",
            {
              labourId: mark.labourId,
              labourCategoryId: line.labourCategoryId,
            },
          );
      if (mark.supervisorId != null && !supervisors.has(mark.supervisorId))
        throw rowError(
          "SUPERVISOR_NOT_FOUND",
          "This Supervisor was not found.",
          "invalid",
          { labourId: mark.labourId, supervisorId: mark.supervisorId },
        );
    }

    // Concurrency and the create/update split, per row.
    const existing = new Map(existingDays.map((day) => [day.labourId, day]));
    const expected = input.expected ?? {};
    let creates = false;
    let edits = false;
    for (const mark of input.marks) {
      const row = existing.get(mark.labourId);
      const seen = expected[mark.labourId];
      const name = labourers.get(mark.labourId)?.name ?? "This Labour";
      if (row == null) {
        if (seen != null)
          throw conflict(
            "ATTENDANCE_CHANGED",
            `${name}'s day was cleared after you opened it. Reload to see the latest.`,
            { labourId: mark.labourId },
          );
        if (!input.canCreate)
          throw rowError(
            "PERMISSION_DENIED",
            "You do not have permission to mark new attendance.",
            "forbidden",
            { labourId: mark.labourId },
          );
        creates = true;
      } else {
        if (seen?.getTime() !== row.updatedAt.getTime())
          throw conflict(
            "ATTENDANCE_CHANGED",
            `${name}'s day was changed after you opened it. Reload to see the latest.`,
            { labourId: mark.labourId },
          );
        if (!input.canEdit)
          throw rowError(
            "PERMISSION_DENIED",
            "You do not have permission to change marked attendance.",
            "forbidden",
            { labourId: mark.labourId },
          );
        edits = true;
      }
    }
    if (creates) await this.backdated.assert("create", actor, date);
    if (edits) await this.backdated.assert("edit", actor, date);

    const now = this.clock();
    const writes: LabourDayWrite[] = input.marks.map((mark, index) => {
      const labourer = labourers.get(mark.labourId);
      if (labourer == null) throw new Error("unreachable");
      // The supervisor snapshot defaults to the labourer's own, when live.
      const own =
        labourer.supervisorId != null && supervisors.has(labourer.supervisorId)
          ? labourer.supervisorId
          : null;
      // A line sent without a rate (a member without Financial cannot see
      // it) keeps the rate the saved day had for that category, so a
      // re-mark never silently resets a custom overtime rate. The line from
      // the times keeps the saved line from the times first.
      const saved = existing.get(mark.labourId)?.overtime ?? [];
      const overtime = mark.overtime?.map((line) => {
        if (line.ratePerHour != null) return line;
        const fromTimes = line.fromTimes === true;
        const sameCategory = (old: (typeof saved)[number]) =>
          old.labourCategoryId === line.labourCategoryId;
        const kept =
          saved.find((old) =>
            fromTimes ? old.fromTimes : !old.fromTimes && sameCategory(old),
          ) ?? saved.find(sameCategory);
        return kept == null ? line : { ...line, ratePerHour: kept.ratePerHour };
      });
      let day: PricedDay;
      try {
        day = priceDay({
          mark: {
            ...mark,
            overtime,
            supervisorId:
              mark.supervisorId === undefined ? own : mark.supervisorId,
          },
          card: labourer.card,
          projectId: input.projectId,
          date,
        });
      } catch (error) {
        throw forLabourer(error, mark.labourId);
      }
      const row = existing.get(mark.labourId);
      return {
        id: row?.id ?? newId(now.getTime() + index),
        day,
        expectedUpdatedAt: row?.updatedAt ?? null,
      };
    });
    await this.store.save({
      workspaceId,
      writes,
      reason: "marked",
      by: actor.userId,
      now,
    });
    const saved = await this.store.daysOf(workspaceId, ids, date);
    const order = new Map(ids.map((id, index) => [id, index]));
    saved.sort(
      (a, b) => (order.get(a.labourId) ?? 0) - (order.get(b.labourId) ?? 0),
    );
    return this.readModels(workspaceId, saved);
  }

  /**
   * Clears marked days on a Project: tombstones the rows and reverses their
   * ledger entries, all or none. Each row needs its `updatedAt` in `expected`.
   */
  async clearDay(input: {
    actor: LabourAttendanceActor;
    projectId: string;
    date: string;
    labourIds: readonly string[];
    expected: Readonly<Record<string, Date>>;
  }): Promise<void> {
    const { actor } = input;
    const date = assertCalendarDate(input.date.trim(), "DATE_INVALID");
    if (input.labourIds.length === 0)
      throw new DomainError(
        "ATTENDANCE_EMPTY",
        "Choose at least one Labour to clear.",
      );
    if (new Set(input.labourIds).size !== input.labourIds.length)
      throw new DomainError(
        "LABOUR_MARKED_TWICE",
        "A Labour appears twice in this request.",
      );
    await this.assertProject(actor.workspaceId, input.projectId);
    const days = await this.store.daysOf(
      actor.workspaceId,
      input.labourIds,
      date,
    );
    const byLabour = new Map(
      days
        .filter((day) => day.projectId === input.projectId)
        .map((day) => [day.labourId, day]),
    );
    const clears = input.labourIds.map((labourId) => {
      const day = byLabour.get(labourId);
      if (day == null)
        throw rowError(
          "ATTENDANCE_NOT_FOUND",
          "This Labour has no attendance on this Project that day.",
          "not_found",
          { labourId },
        );
      const seen = input.expected[labourId];
      if (seen?.getTime() !== day.updatedAt.getTime())
        throw conflict(
          "ATTENDANCE_CHANGED",
          "This day was changed after you opened it. Reload to see the latest.",
          { labourId },
        );
      return { day, expectedUpdatedAt: seen };
    });
    await this.backdated.assert("edit", actor, date);
    await this.store.clear({
      workspaceId: actor.workspaceId,
      days: clears,
      by: actor.userId,
      now: this.clock(),
    });
  }

  /**
   * "Mark Paid Leave" (`modules/08`): toggles Paid Leave on an On Leave day
   * and reposts its ledger entries. The snapshot wage stays.
   */
  async setPaidLeave(input: {
    actor: LabourAttendanceActor;
    attendanceId: string;
    isPaidLeave: boolean;
    expectedUpdatedAt: Date;
  }): Promise<LabourAttendanceDayReadModel> {
    const { actor } = input;
    const stored = await this.store.findById(
      actor.workspaceId,
      input.attendanceId,
    );
    if (stored == null)
      throw notFound("ATTENDANCE_NOT_FOUND", "This attendance was not found.");
    if (stored.updatedAt.getTime() !== input.expectedUpdatedAt.getTime())
      throw conflict(
        "ATTENDANCE_CHANGED",
        "This day was changed after you opened it. Reload to see the latest.",
        { labourId: stored.labourId },
      );
    let day: PricedDay;
    try {
      day = withPaidLeave(stored, input.isPaidLeave);
    } catch (error) {
      throw forLabourer(error, stored.labourId);
    }
    await this.backdated.assert("edit", actor, stored.date);
    await this.store.save({
      workspaceId: actor.workspaceId,
      writes: [
        {
          id: stored.id,
          day: {
            labourId: day.labourId,
            projectId: day.projectId,
            date: day.date,
            status: day.status,
            isPaidLeave: day.isPaidLeave,
            shift: day.shift,
            supervisorId: day.supervisorId,
            checkIn: day.checkIn,
            checkOut: day.checkOut,
            breakMinutes: day.breakMinutes,
            workingHours: day.workingHours,
            wageType: day.wageType,
            wageRate: day.wageRate,
            earned: day.earned,
            overtime: day.overtime,
          },
          expectedUpdatedAt: input.expectedUpdatedAt,
        },
      ],
      reason: "paid_leave",
      by: actor.userId,
      now: this.clock(),
    });
    const saved = await this.store.findById(actor.workspaceId, stored.id);
    if (saved == null)
      throw notFound("ATTENDANCE_NOT_FOUND", "This attendance was not found.");
    const [model] = await this.readModels(actor.workspaceId, [saved]);
    if (model == null) throw new Error("unreachable");
    return model;
  }

  /** The Project of a marked day, for the route's project-scoped check. */
  async projectOf(workspaceId: string, id: string): Promise<string> {
    const day = await this.store.findById(workspaceId, id);
    if (day == null)
      throw notFound("ATTENDANCE_NOT_FOUND", "This attendance was not found.");
    return day.projectId;
  }

  /**
   * The marking sheet for a Project and date: every active labourer on the
   * Project that day (transfer history) with the day's row if marked, the
   * pre-fill hint, and labourers marked here who since became inactive
   * (read-only).
   */
  async sheet(
    workspaceId: string,
    projectId: string,
    rawDate: string,
  ): Promise<LabourSheetReadModel> {
    const date = assertCalendarDate(rawDate.trim(), "DATE_INVALID");
    await this.assertProject(workspaceId, projectId);
    const [onProject, marked, categoryOptions] = await Promise.all([
      this.store.labourersOn(workspaceId, projectId, date),
      this.store.daysBetween(workspaceId, projectId, date, date),
      this.store.categoryOptions(workspaceId),
    ]);
    const listed = new Set(onProject.map((labourer) => labourer.id));
    const otherIds = marked
      .map((day) => day.labourId)
      .filter((id) => !listed.has(id));
    const others = await this.store.labourers(workspaceId, otherIds);
    const everyone = [
      ...onProject.map((labourer) => ({ labourer, canMark: true })),
      ...otherIds.map((id) => ({
        labourer: others.get(id) ?? null,
        id,
        canMark: false,
      })),
    ];
    const allIds = [...listed, ...otherIds];
    const [yesterdayDays, models] = await Promise.all([
      this.store.daysOf(workspaceId, allIds, addDays(date, -1)),
      this.readModels(workspaceId, marked),
    ]);
    const yesterday = new Map(yesterdayDays.map((day) => [day.labourId, day]));
    const today = new Map(models.map((model) => [model.labourId, model]));
    const [categories, supervisors] = await Promise.all([
      this.labourCategories.find(workspaceId, [
        ...new Set(
          everyone
            .map((entry) => entry.labourer?.labourCategoryId)
            .filter((id): id is string => id != null),
        ),
      ]),
      this.supervisors.find(workspaceId, [
        ...new Set(
          everyone
            .map((entry) => entry.labourer?.supervisorId)
            .filter((id): id is string => id != null),
        ),
      ]),
    ]);
    const weekday = weekdayOf(date);

    const rows: LabourSheetRowReadModel[] = everyone.map((entry) => {
      const labourer = entry.labourer;
      const labourId = labourer?.id ?? ("id" in entry ? entry.id : "");
      const attendance = today.get(labourId) ?? null;
      const before = yesterday.get(labourId);
      const weeklyHolidays = labourer?.weeklyHolidays ?? [];
      const isWeeklyHoliday = weeklyHolidays.includes(weekday);
      const category =
        labourer?.labourCategoryId == null
          ? undefined
          : categories.get(labourer.labourCategoryId);
      const supervisor =
        labourer?.supervisorId == null
          ? undefined
          : supervisors.get(labourer.supervisorId);
      return {
        labourId,
        name: labourer?.name ?? attendance?.labourName ?? "",
        labourCode: labourer?.labourCode ?? attendance?.labourCode ?? null,
        labourCategory:
          category == null ? null : { id: category.id, name: category.name },
        supervisor:
          supervisor == null
            ? (attendance?.supervisor ?? null)
            : { id: supervisor.id, name: supervisor.name },
        weeklyHolidays,
        wageType: labourer?.card.wageType ?? attendance?.wageType ?? null,
        wagePerDay: labourer?.card.wagePerDay ?? null,
        wagePerMonth: labourer?.card.wagePerMonth ?? null,
        overtimeWagePerHour: labourer?.card.overtimeWagePerHour ?? null,
        workingHoursPerDay: labourer?.card.workingHours ?? null,
        canMark: entry.canMark,
        isActive: labourer?.isActive ?? false,
        onProject: entry.canMark,
        isWeeklyHoliday,
        suggestedStatus: isWeeklyHoliday ? "holiday" : (before?.status ?? null),
        yesterday:
          before == null
            ? null
            : {
                status: before.status,
                isPaidLeave: before.isPaidLeave,
                shift: before.shift,
                checkIn: before.checkIn,
                checkOut: before.checkOut,
                breakMinutes: before.breakMinutes,
              },
        attendance,
      };
    });

    const supervisorRefs = new Map<string, Ref>();
    for (const row of rows)
      if (row.supervisor != null)
        supervisorRefs.set(row.supervisor.id, row.supervisor);
    const totals = {
      marked: models.length,
      present: 0,
      halfDay: 0,
      absent: 0,
      onLeave: 0,
      holiday: 0,
      earned: 0,
      overtimeAmount: 0,
    };
    for (const model of models) {
      if (model.status === "present") totals.present += 1;
      else if (model.status === "half_day") totals.halfDay += 1;
      else if (model.status === "absent") totals.absent += 1;
      else if (model.status === "on_leave") totals.onLeave += 1;
      else totals.holiday += 1;
      totals.earned += model.earned;
      totals.overtimeAmount += model.overtimeAmount;
    }
    const collator = new Intl.Collator("en", {
      sensitivity: "base",
      numeric: true,
    });
    return {
      projectId,
      date,
      labourers: rows,
      labourCategories: categoryOptions,
      supervisors: [...supervisorRefs.values()].sort((a, b) =>
        collator.compare(a.name, b.name),
      ),
      totals,
    };
  }

  /** Marked days of a Project, newest date first, with filters and cursors. */
  async list(params: LabourDayListParams): Promise<{
    items: LabourAttendanceDayReadModel[];
    total: number;
    hasMore: boolean;
  }> {
    if (params.from != null) assertCalendarDate(params.from, "DATE_INVALID");
    if (params.to != null) assertCalendarDate(params.to, "DATE_INVALID");
    if (
      params.from != null &&
      params.to != null &&
      daysBetween(params.from, params.to) < 0
    )
      throw new DomainError(
        "DATE_RANGE_INVALID",
        "The end date must be on or after the start date.",
      );
    if (
      params.status != null &&
      params.status !== "paid_leave" &&
      !ATTENDANCE_STATUSES.includes(params.status)
    )
      throw new DomainError("STATUS_INVALID", "Unknown attendance status.");
    await this.assertProject(params.workspaceId, params.projectId);
    const page = await this.store.list(params);
    return {
      items: await this.readModels(params.workspaceId, page.items),
      total: page.total,
      hasMore: page.hasMore,
    };
  }

  /**
   * The month grid: labourer × day codes with overtime, and totals per
   * labourer. Lists every labourer marked here that month, plus the active
   * labourers on the Project at the month's end (or today) with no marks.
   */
  async month(
    workspaceId: string,
    projectId: string,
    month: string,
  ): Promise<LabourMonthReadModel> {
    if (!MONTH_RE.test(month))
      throw new DomainError(
        "MONTH_INVALID",
        `"${month}" is not a month (YYYY-MM).`,
      );
    const { from, to } = monthOf(`${month}-01`);
    await this.assertProject(workspaceId, projectId);
    const today = await this.store.today(workspaceId);
    const rosterDate = daysBetween(today, to) > 0 ? today : to;
    const [days, roster] = await Promise.all([
      this.store.daysBetween(workspaceId, projectId, from, to),
      daysBetween(from, rosterDate) >= 0
        ? this.store.labourersOn(workspaceId, projectId, rosterDate)
        : Promise.resolve([]),
    ]);
    const names = await this.store.labourNames(workspaceId, [
      ...days.map((day) => day.labourId),
      ...roster.map((labourer) => labourer.id),
    ]);

    type Totals = LabourMonthTotals & { hundredths?: number };
    const rows = new Map<
      string,
      Omit<LabourMonthReadModel["labourers"][number], "totals"> & {
        totals: Totals;
      }
    >();
    const ensure = (labourId: string) => {
      const found = rows.get(labourId);
      if (found != null) return found;
      const created = {
        labourId,
        name: names.get(labourId)?.name ?? "",
        labourCode: names.get(labourId)?.labourCode ?? null,
        days: [],
        totals: emptyTotals() as Totals,
      };
      rows.set(labourId, created);
      return created;
    };
    for (const labourer of roster) ensure(labourer.id);
    const totals: Totals = emptyTotals();
    const counts = new Map<
      CalendarDate,
      { date: CalendarDate; present: number; halfDay: number; marked: number }
    >();
    for (const day of days) {
      const row = ensure(day.labourId);
      row.days.push({
        date: day.date,
        attendanceId: day.id,
        code: dayCode(day.status, day.isPaidLeave),
        status: day.status,
        isPaidLeave: day.isPaidLeave,
        overtimeHours: formatHundredths(overtimeHundredths(day)),
        earned: day.earned,
        overtimeAmount: overtimeAmountOf(day),
      });
      addDay(row.totals, day);
      addDay(totals, day);
      const count = counts.get(day.date) ?? {
        date: day.date,
        present: 0,
        halfDay: 0,
        marked: 0,
      };
      count.marked += 1;
      if (day.status === "present") count.present += 1;
      if (day.status === "half_day") count.halfDay += 1;
      counts.set(day.date, count);
    }
    const collator = new Intl.Collator("en", {
      sensitivity: "base",
      numeric: true,
    });
    return {
      projectId,
      month,
      from,
      to,
      dates: datesBetween(from, to),
      labourers: [...rows.values()]
        .map((row) => ({ ...row, totals: stripHundredths(row.totals) }))
        .sort((a, b) => collator.compare(a.name, b.name)),
      dayCounts: [...counts.values()].sort((a, b) =>
        a.date.localeCompare(b.date),
      ),
      totals: stripHundredths(totals),
    };
  }
}
