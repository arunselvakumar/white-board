import {
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import {
  conflict,
  DomainError,
  forbidden,
  notFound,
} from "@/src/shared-kernel/domain-error";
import { newId } from "@/src/shared-kernel/ids";

import { monthOf } from "../domain/ledger";
import type { Vendor } from "../domain/vendor";
import {
  priceVendorDay,
  type PricedVendorDay,
  type PricedVendorLine,
  type RateCard,
  type VendorLineInput,
} from "../domain/vendor-attendance";
import { datesBetween, vendorLineAmount } from "../domain/wages";
import type { LabourCategoryDirectory, ProjectDirectory } from "./directories";
import type { VendorStore } from "./vendor-handlers";

/** A recorded vendor day as stored: the live row and its priced lines. */
export type StoredVendorDay = {
  id: string;
  workspaceId: string;
  projectId: string;
  vendorId: string;
  date: CalendarDate;
  /** Paise. */
  totalPay: number;
  lines: PricedVendorLine[];
  createdAt: Date;
  updatedAt: Date;
  createdBy: string;
  updatedBy: string;
};

export type VendorDayListParams = {
  workspaceId: string;
  projectId: string;
  from?: CalendarDate;
  to?: CalendarDate;
  vendorId?: string;
  labourCategoryId?: string;
  /** 1-based. */
  page: number;
  pageSize: number;
};

/**
 * Where vendor attendance lives (Prisma in infrastructure). `save` and
 * `clear` run in one transaction with the vendor ledger entries and the
 * audit event (ADR CM-0004).
 */
export type VendorAttendanceStore = {
  findById(workspaceId: string, id: string): Promise<StoredVendorDay | null>;
  /** The live row of a vendor on a Project on a date. */
  findDay(
    workspaceId: string,
    vendorId: string,
    projectId: string,
    date: CalendarDate,
  ): Promise<StoredVendorDay | null>;
  /** Live rows of a Project between two dates (inclusive), oldest first. */
  daysBetween(
    workspaceId: string,
    projectId: string,
    from: CalendarDate,
    to: CalendarDate,
  ): Promise<StoredVendorDay[]>;
  /** Newest date first, then vendor name. */
  list(
    params: VendorDayListParams,
  ): Promise<{ items: StoredVendorDay[]; total: number }>;
  /**
   * Creates the row (`expectedUpdatedAt` null; 409
   * `VENDOR_ATTENDANCE_CHANGED` when a live row already exists) or
   * compare-and-sets it on `updatedAt` and replaces its lines; reverses the
   * row's live ledger entries and posts the new ones. Locks the vendor row
   * first: 404 `VENDOR_NOT_FOUND` when it was deleted meanwhile.
   */
  save(input: {
    id: string;
    workspaceId: string;
    day: PricedVendorDay;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void>;
  /** Tombstones the row and reverses its ledger entries (409 when stale). */
  clear(input: {
    day: StoredVendorDay;
    expectedUpdatedAt: Date | null;
    by: string;
    now: Date;
  }): Promise<void>;
  /** Names of vendors by id, including inactive and deleted ones. */
  vendorNames(
    workspaceId: string,
    ids: readonly string[],
  ): Promise<Map<string, string>>;
};

/** Who is entering, for the back-dated guard and the edit permission. */
export type VendorAttendanceActor = {
  workspaceId: string;
  userId: string;
  role: "owner" | "member";
};

/** The kernel's back-dated entry policy, `module = vendor_attendance`. */
export type VendorAttendanceBackdatedGuard = {
  assert(
    action: "create" | "edit",
    actor: VendorAttendanceActor,
    date: CalendarDate,
  ): Promise<void>;
};

export type VendorAttendanceLineReadModel = PricedVendorLine & {
  /** Null when the category was deleted from Masters. */
  labourCategoryName: string | null;
};

export type VendorAttendanceDayReadModel = {
  id: string;
  projectId: string;
  vendorId: string;
  vendorName: string;
  date: CalendarDate;
  totalPay: number;
  fullDayCount: number;
  halfDayCount: number;
  /** Decimal string, hours. */
  overtimeHours: string;
  lines: VendorAttendanceLineReadModel[];
  createdAt: Date;
  updatedAt: Date;
};

export type VendorGridRateReadModel = {
  labourCategoryId: string;
  labourCategoryName: string | null;
  ratePerDay: number;
  overtimePerHour: number;
};

export type VendorGridShiftReadModel = {
  id: string;
  name: string;
  startTime: string | null;
  endTime: string | null;
  rates: VendorGridRateReadModel[];
};

export type VendorGridRowReadModel = {
  vendorId: string;
  vendorName: string;
  /** Active, assigned to the Project, and with a rate card: can be recorded. */
  canRecord: boolean;
  /** Assigned to the Project (false for a vendor recorded here before being removed). */
  onProject: boolean;
  isActive: boolean;
  hasRateCard: boolean;
  /** The live rate card; empty when the vendor cannot be recorded. */
  shifts: VendorGridShiftReadModel[];
  attendance: VendorAttendanceDayReadModel | null;
};

export type VendorDayGridReadModel = {
  projectId: string;
  date: CalendarDate;
  vendors: VendorGridRowReadModel[];
  /** Paise: the sum of the recorded days. */
  totalPay: number;
};

export type VendorCounts = {
  fullDayCount: number;
  halfDayCount: number;
  overtimeHours: string;
  pay: number;
};

export type VendorMonthReadModel = {
  projectId: string;
  month: string;
  from: CalendarDate;
  to: CalendarDate;
  dates: CalendarDate[];
  vendors: {
    vendorId: string;
    vendorName: string;
    /** Recorded dates only. */
    days: (VendorCounts & { date: CalendarDate; attendanceId: string })[];
    totals: VendorCounts;
  }[];
  categories: (VendorCounts & {
    labourCategoryId: string;
    labourCategoryName: string | null;
  })[];
  /** Per date, every vendor together (recorded dates only). */
  dayTotals: (VendorCounts & { date: CalendarDate })[];
  totals: VendorCounts;
};

export type VendorOvertimeLineReadModel = {
  attendanceId: string;
  date: CalendarDate;
  vendorId: string;
  vendorName: string;
  shiftId: string;
  shiftName: string;
  labourCategoryId: string;
  labourCategoryName: string | null;
  overtimeHours: string;
  overtimePerHour: number;
  /** Paise: hours × overtime rate, rounded half up. */
  overtimeAmount: number;
};

export type VendorOvertimeReadModel = {
  projectId: string;
  from: CalendarDate;
  to: CalendarDate;
  items: VendorOvertimeLineReadModel[];
  totalHours: string;
  totalAmount: number;
};

export type RecordVendorDayInput = {
  actor: VendorAttendanceActor;
  projectId: string;
  vendorId: string;
  date: string;
  lines: readonly VendorLineInput[];
  /** Required to change a day already recorded; null records a new one. */
  expectedUpdatedAt: Date | null;
  /** Whether the actor may edit a recorded day (`labour.attendance` update). */
  canEdit: boolean;
};

/** The longest range the overtime view and list read at once. */
export const MAX_RANGE_DAYS = 366;

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/** Overtime hours (≤ 2 decimals) as whole hundredths, so sums stay exact. */
export function hoursToHundredths(hours: string): number {
  const [whole = "0", fraction = ""] = hours.trim().split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

export function hundredthsToHours(value: number): string {
  const whole = Math.floor(value / 100);
  const fraction = value % 100;
  if (fraction === 0) return String(whole);
  return `${String(whole)}.${String(fraction).padStart(2, "0").replace(/0$/, "")}`;
}

function sumCounts(lines: readonly PricedVendorLine[]): VendorCounts {
  let full = 0;
  let half = 0;
  let hours = 0;
  let pay = 0;
  for (const line of lines) {
    full += line.fullDayCount;
    half += line.halfDayCount;
    hours += hoursToHundredths(line.overtimeHours);
    pay += line.amount;
  }
  return {
    fullDayCount: full,
    halfDayCount: half,
    overtimeHours: hundredthsToHours(hours),
    pay,
  };
}

function addCounts(a: VendorCounts, b: VendorCounts): VendorCounts {
  return {
    fullDayCount: a.fullDayCount + b.fullDayCount,
    halfDayCount: a.halfDayCount + b.halfDayCount,
    overtimeHours: hundredthsToHours(
      hoursToHundredths(a.overtimeHours) + hoursToHundredths(b.overtimeHours),
    ),
    pay: a.pay + b.pay,
  };
}

const ZERO: VendorCounts = {
  fullDayCount: 0,
  halfDayCount: 0,
  overtimeHours: "0",
  pay: 0,
};

function rateCardOf(vendor: Vendor): RateCard {
  return new Map(
    vendor.shifts.map((shift) => [
      shift.id,
      {
        name: shift.name,
        rates: new Map(
          shift.rates.map((rate) => [
            rate.labourCategoryId,
            {
              ratePerDay: rate.ratePerDay,
              overtimePerHour: rate.overtimePerHour,
            },
          ]),
        ),
      },
    ]),
  );
}

/** Adds the line's position to a domain error so a screen can point at it. */
function onLine(error: unknown, index: number, line: VendorLineInput): unknown {
  if (!(error instanceof DomainError)) return error;
  const details =
    error.details != null && typeof error.details === "object"
      ? (error.details as Record<string, unknown>)
      : {};
  return new DomainError(error.code, error.message, {
    kind: error.kind,
    details: {
      ...details,
      lineIndex: index,
      shiftId: line.shiftId,
      labourCategoryId: line.labourCategoryId,
    },
  });
}

/**
 * Prices the day. Each line is priced on its own first so an error names
 * the line (`details.lineIndex`); then the whole day (duplicates, empty).
 */
function price(
  input: Omit<Parameters<typeof priceVendorDay>[0], "card"> & {
    card: RateCard;
  },
): PricedVendorDay {
  input.lines.forEach((line, index) => {
    try {
      priceVendorDay({ ...input, lines: [line] });
    } catch (error) {
      throw onLine(error, index, line);
    }
  });
  try {
    return priceVendorDay(input);
  } catch (error) {
    if (
      error instanceof DomainError &&
      error.details != null &&
      typeof error.details === "object"
    ) {
      const { shiftId, labourCategoryId } = error.details as {
        shiftId?: string;
        labourCategoryId?: string;
      };
      let index = -1;
      input.lines.forEach((line, at) => {
        if (
          line.shiftId === shiftId &&
          line.labourCategoryId === labourCategoryId
        )
          index = at;
      });
      const line = input.lines[index];
      if (line != null) throw onLine(error, index, line);
    }
    throw error;
  }
}

function assertRange(from: CalendarDate, to: CalendarDate): void {
  assertCalendarDate(from, "DATE_INVALID");
  assertCalendarDate(to, "DATE_INVALID");
  const days = daysBetween(from, to);
  if (days < 0)
    throw new DomainError(
      "DATE_RANGE_INVALID",
      "The end date must be on or after the start date.",
    );
  if (days >= MAX_RANGE_DAYS)
    throw new DomainError(
      "DATE_RANGE_TOO_LONG",
      `Choose at most ${String(MAX_RANGE_DAYS)} days.`,
    );
}

/**
 * Vendor attendance (CM-212): record and clear a vendor's day on a Project,
 * priced from the vendor's live rate card, with the day grid, the list, the
 * month view and the overtime view (CM-213). Menu access is checked by the
 * caller; the back-dated guard and the edit flag here.
 */
export class VendorAttendanceHandlers {
  constructor(
    private readonly store: VendorAttendanceStore,
    private readonly vendors: Pick<
      VendorStore,
      "find" | "listForProject" | "today"
    >,
    private readonly projects: ProjectDirectory,
    private readonly labourCategories: LabourCategoryDirectory,
    private readonly backdated: VendorAttendanceBackdatedGuard,
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

  private async categoryNames(
    workspaceId: string,
    ids: Iterable<string>,
  ): Promise<Map<string, string>> {
    const found = await this.labourCategories.find(workspaceId, [
      ...new Set(ids),
    ]);
    return new Map([...found.values()].map((item) => [item.id, item.name]));
  }

  private toReadModel(
    day: StoredVendorDay,
    vendorName: string,
    categories: Map<string, string>,
  ): VendorAttendanceDayReadModel {
    const counts = sumCounts(day.lines);
    return {
      id: day.id,
      projectId: day.projectId,
      vendorId: day.vendorId,
      vendorName,
      date: day.date,
      totalPay: day.totalPay,
      fullDayCount: counts.fullDayCount,
      halfDayCount: counts.halfDayCount,
      overtimeHours: counts.overtimeHours,
      lines: day.lines.map((line) => ({
        ...line,
        labourCategoryName: categories.get(line.labourCategoryId) ?? null,
      })),
      createdAt: day.createdAt,
      updatedAt: day.updatedAt,
    };
  }

  private async readModels(
    workspaceId: string,
    days: readonly StoredVendorDay[],
  ): Promise<VendorAttendanceDayReadModel[]> {
    const [names, categories] = await Promise.all([
      this.store.vendorNames(
        workspaceId,
        days.map((day) => day.vendorId),
      ),
      this.categoryNames(
        workspaceId,
        days.flatMap((day) => day.lines.map((line) => line.labourCategoryId)),
      ),
    ]);
    return days.map((day) =>
      this.toReadModel(day, names.get(day.vendorId) ?? "", categories),
    );
  }

  /**
   * Records a vendor's day (one live row per vendor, Project and date).
   * A new day passes the back-dated create limit; changing a recorded day
   * needs `expectedUpdatedAt`, the edit permission and the edit limit. Every
   * line is priced from the vendor's current rate card, also on an edit.
   */
  async record(
    input: RecordVendorDayInput,
  ): Promise<VendorAttendanceDayReadModel> {
    const { actor } = input;
    const date = assertCalendarDate(input.date.trim(), "DATE_INVALID");
    const today = await this.vendors.today(actor.workspaceId);
    if (daysBetween(today, date) > 0)
      throw new DomainError(
        "ATTENDANCE_DATE_IN_FUTURE",
        "Attendance cannot be recorded for a future date.",
        { details: { date, today } },
      );
    await this.assertProject(actor.workspaceId, input.projectId);
    const vendor = await this.vendors.find(actor.workspaceId, input.vendorId);
    if (vendor == null)
      throw notFound("VENDOR_NOT_FOUND", "This Vendor was not found.");
    if (!vendor.projectIds.includes(input.projectId))
      throw new DomainError(
        "VENDOR_NOT_ON_PROJECT",
        `${vendor.name} is not assigned to this Project. Add the Project to the Vendor in Masters → Vendors.`,
        { details: { vendorId: vendor.id, projectId: input.projectId } },
      );
    if (!vendor.isActive)
      throw new DomainError(
        "VENDOR_INACTIVE",
        "This Vendor is inactive. Activate them to record attendance.",
        { details: { vendorId: vendor.id } },
      );
    if (!vendor.hasRateCard)
      throw new DomainError(
        "VENDOR_NO_RATE_CARD",
        "Add a shift with at least one Labour Category rate before recording attendance.",
        { details: { vendorId: vendor.id } },
      );

    const existing = await this.store.findDay(
      actor.workspaceId,
      vendor.id,
      input.projectId,
      date,
    );
    if (existing == null && input.expectedUpdatedAt != null)
      throw conflict(
        "VENDOR_ATTENDANCE_CHANGED",
        "This day was cleared after you opened it. Reload to see the latest.",
      );
    if (existing != null) {
      if (input.expectedUpdatedAt == null)
        throw conflict(
          "VENDOR_ATTENDANCE_CHANGED",
          "Someone recorded this day after you opened it. Reload to see their entry.",
        );
      if (!input.canEdit)
        throw forbidden(
          "PERMISSION_DENIED",
          "You do not have permission to change recorded attendance.",
        );
      await this.backdated.assert("edit", actor, date);
    } else {
      await this.backdated.assert("create", actor, date);
    }

    const day = price({
      vendorId: vendor.id,
      projectId: input.projectId,
      date,
      lines: input.lines,
      card: rateCardOf(vendor),
    });
    const now = this.clock();
    const id = existing?.id ?? newId(now.getTime());
    await this.store.save({
      id,
      workspaceId: actor.workspaceId,
      day,
      expectedUpdatedAt: existing == null ? null : input.expectedUpdatedAt,
      by: actor.userId,
      now,
    });
    const saved = await this.store.findById(actor.workspaceId, id);
    if (saved == null)
      throw notFound(
        "VENDOR_ATTENDANCE_NOT_FOUND",
        "This attendance was not found.",
      );
    const [model] = await this.readModels(actor.workspaceId, [saved]);
    if (model == null) throw new Error("unreachable");
    return model;
  }

  /** Clears a recorded day: tombstone plus ledger reversal (edit limit applies). */
  async clear(input: {
    actor: VendorAttendanceActor;
    id: string;
    expectedUpdatedAt: Date | null;
  }): Promise<void> {
    const day = await this.store.findById(input.actor.workspaceId, input.id);
    if (day == null)
      throw notFound(
        "VENDOR_ATTENDANCE_NOT_FOUND",
        "This attendance was not found.",
      );
    await this.backdated.assert("edit", input.actor, day.date);
    await this.store.clear({
      day,
      expectedUpdatedAt: input.expectedUpdatedAt,
      by: input.actor.userId,
      now: this.clock(),
    });
  }

  /** The Project of a recorded day, for the route's project-scoped check. */
  async projectOf(workspaceId: string, id: string): Promise<string> {
    const day = await this.store.findById(workspaceId, id);
    if (day == null)
      throw notFound(
        "VENDOR_ATTENDANCE_NOT_FOUND",
        "This attendance was not found.",
      );
    return day.projectId;
  }

  /**
   * The marking grid for one date: every active vendor on the Project with
   * its rate card and that day's lines, plus vendors recorded that day who
   * since left the Project or were deactivated (read-only).
   */
  async day(
    workspaceId: string,
    projectId: string,
    rawDate: string,
  ): Promise<VendorDayGridReadModel> {
    const date = assertCalendarDate(rawDate.trim(), "DATE_INVALID");
    await this.assertProject(workspaceId, projectId);
    const [vendors, days] = await Promise.all([
      this.vendors.listForProject(workspaceId, projectId),
      this.store.daysBetween(workspaceId, projectId, date, date),
    ]);
    const recorded = await this.readModels(workspaceId, days);
    const byVendor = new Map(recorded.map((day) => [day.vendorId, day]));
    const categories = await this.categoryNames(
      workspaceId,
      vendors.flatMap((vendor) => [...vendor.categoryIds]),
    );
    const rows: VendorGridRowReadModel[] = vendors.map((vendor) => ({
      vendorId: vendor.id,
      vendorName: vendor.name,
      canRecord: vendor.hasRateCard,
      onProject: true,
      isActive: vendor.isActive,
      hasRateCard: vendor.hasRateCard,
      shifts: vendor.shifts.map((shift) => ({
        id: shift.id,
        name: shift.name,
        startTime: shift.startTime,
        endTime: shift.endTime,
        rates: shift.rates.map((rate) => ({
          labourCategoryId: rate.labourCategoryId,
          labourCategoryName: categories.get(rate.labourCategoryId) ?? null,
          ratePerDay: rate.ratePerDay,
          overtimePerHour: rate.overtimePerHour,
        })),
      })),
      attendance: byVendor.get(vendor.id) ?? null,
    }));
    const listed = new Set(vendors.map((vendor) => vendor.id));
    const others = await Promise.all(
      recorded
        .filter((day) => !listed.has(day.vendorId))
        .map(async (day): Promise<VendorGridRowReadModel> => {
          const vendor = await this.vendors.find(workspaceId, day.vendorId);
          return {
            vendorId: day.vendorId,
            vendorName: day.vendorName,
            canRecord: false,
            onProject: vendor?.projectIds.includes(projectId) ?? false,
            isActive: vendor?.isActive ?? false,
            hasRateCard: vendor?.hasRateCard ?? false,
            shifts: [],
            attendance: day,
          };
        }),
    );
    return {
      projectId,
      date,
      vendors: [...rows, ...others],
      totalPay: recorded.reduce((sum, day) => sum + day.totalPay, 0),
    };
  }

  /** Recorded days of a Project, newest first, with filters and a page. */
  async list(params: VendorDayListParams): Promise<{
    items: VendorAttendanceDayReadModel[];
    total: number;
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
    await this.assertProject(params.workspaceId, params.projectId);
    const page = await this.store.list(params);
    return {
      items: await this.readModels(params.workspaceId, page.items),
      total: page.total,
    };
  }

  /** Vendor × day matrix for a calendar month, with totals per vendor and per category. */
  async month(
    workspaceId: string,
    projectId: string,
    month: string,
  ): Promise<VendorMonthReadModel> {
    if (!MONTH_RE.test(month))
      throw new DomainError(
        "MONTH_INVALID",
        `"${month}" is not a month (YYYY-MM).`,
      );
    const { from, to } = monthOf(`${month}-01`);
    await this.assertProject(workspaceId, projectId);
    const days = await this.store.daysBetween(workspaceId, projectId, from, to);
    const [names, categoryNames] = await Promise.all([
      this.store.vendorNames(
        workspaceId,
        days.map((day) => day.vendorId),
      ),
      this.categoryNames(
        workspaceId,
        days.flatMap((day) => day.lines.map((line) => line.labourCategoryId)),
      ),
    ]);

    const vendors = new Map<string, VendorMonthReadModel["vendors"][number]>();
    const categories = new Map<string, VendorCounts>();
    const dayTotals = new Map<CalendarDate, VendorCounts>();
    let totals = ZERO;
    for (const day of days) {
      const counts = sumCounts(day.lines);
      const row = vendors.get(day.vendorId) ?? {
        vendorId: day.vendorId,
        vendorName: names.get(day.vendorId) ?? "",
        days: [],
        totals: ZERO,
      };
      row.days.push({ ...counts, date: day.date, attendanceId: day.id });
      row.totals = addCounts(row.totals, counts);
      vendors.set(day.vendorId, row);
      dayTotals.set(
        day.date,
        addCounts(dayTotals.get(day.date) ?? ZERO, counts),
      );
      totals = addCounts(totals, counts);
      for (const line of day.lines)
        categories.set(
          line.labourCategoryId,
          addCounts(
            categories.get(line.labourCategoryId) ?? ZERO,
            sumCounts([line]),
          ),
        );
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
      vendors: [...vendors.values()].sort((a, b) =>
        collator.compare(a.vendorName, b.vendorName),
      ),
      categories: [...categories.entries()]
        .map(([id, counts]) => ({
          ...counts,
          labourCategoryId: id,
          labourCategoryName: categoryNames.get(id) ?? null,
        }))
        .sort((a, b) =>
          collator.compare(
            a.labourCategoryName ?? "",
            b.labourCategoryName ?? "",
          ),
        ),
      dayTotals: [...dayTotals.entries()]
        .map(([date, counts]) => ({ ...counts, date }))
        .sort((a, b) => a.date.localeCompare(b.date)),
      totals,
    };
  }

  /** Lines with overtime between two dates, oldest first. */
  async overtime(
    workspaceId: string,
    projectId: string,
    from: string,
    to: string,
  ): Promise<VendorOvertimeReadModel> {
    assertRange(from, to);
    await this.assertProject(workspaceId, projectId);
    const days = await this.store.daysBetween(workspaceId, projectId, from, to);
    const models = await this.readModels(workspaceId, days);
    const items: VendorOvertimeLineReadModel[] = models.flatMap((day) =>
      day.lines
        .filter((line) => hoursToHundredths(line.overtimeHours) > 0)
        .map((line) => ({
          attendanceId: day.id,
          date: day.date,
          vendorId: day.vendorId,
          vendorName: day.vendorName,
          shiftId: line.shiftId,
          shiftName: line.shiftName,
          labourCategoryId: line.labourCategoryId,
          labourCategoryName: line.labourCategoryName,
          overtimeHours: line.overtimeHours,
          overtimePerHour: line.overtimePerHour,
          overtimeAmount: vendorLineAmount({
            fullDayCount: 0,
            halfDayCount: 0,
            overtimeHours: line.overtimeHours,
            ratePerDay: line.ratePerDay,
            overtimePerHour: line.overtimePerHour,
          }),
        })),
    );
    return {
      projectId,
      from,
      to,
      items,
      totalHours: hundredthsToHours(
        items.reduce(
          (sum, item) => sum + hoursToHundredths(item.overtimeHours),
          0,
        ),
      ),
      totalAmount: items.reduce((sum, item) => sum + item.overtimeAmount, 0),
    };
  }
}
