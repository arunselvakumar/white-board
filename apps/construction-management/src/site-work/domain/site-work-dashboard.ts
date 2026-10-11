import {
  addDays,
  assertCalendarDate,
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";
import { DomainError } from "@/src/shared-kernel/domain-error";

/**
 * The Project Dashboard's Daily Work and Equipment Usage sections (CM-608,
 * CM-0016 §16), from live sheets that are not rejected.
 */

export type DashboardRange = { from: CalendarDate; to: CalendarDate };

/** The longest duration the dashboard reads, as the duration filter allows. */
export const DASHBOARD_MAX_DAYS = 366;

/** 400 `DASHBOARD_RANGE_INVALID` unless `from ≤ to` within a year. */
export function checkDashboardRange(range: DashboardRange): DashboardRange {
  const from = assertCalendarDate(range.from, "DASHBOARD_RANGE_INVALID");
  const to = assertCalendarDate(range.to, "DASHBOARD_RANGE_INVALID");
  if (to < from)
    throw new DomainError(
      "DASHBOARD_RANGE_INVALID",
      "Choose a start date on or before the end date.",
      { details: { field: "from" } },
    );
  if (daysBetween(from, to) + 1 > DASHBOARD_MAX_DAYS)
    throw new DomainError("DASHBOARD_RANGE_INVALID", "Choose at most a year.", {
      details: { field: "from" },
    });
  return { from, to };
}

/** Worksheet labour on one date. */
export type WorksheetLabourDay = {
  date: CalendarDate;
  skilled: number;
  unskilled: number;
};

/** One day of the labour availability trend. */
export type LabourAvailabilityDay = {
  date: CalendarDate;
  /** Skilled + unskilled on the day's worksheets. */
  worksheet: number;
  /** Attendance heads: labour present or half day, vendor full + half. */
  attendance: number;
};

/**
 * Every date of the range with worksheet labour against attendance heads;
 * a date with neither is zero on both.
 */
export function labourAvailability(
  range: DashboardRange,
  worksheets: readonly WorksheetLabourDay[],
  attendance: readonly { date: CalendarDate; heads: number }[],
): LabourAvailabilityDay[] {
  const onSheets = new Map<CalendarDate, number>();
  for (const day of worksheets)
    onSheets.set(
      day.date,
      (onSheets.get(day.date) ?? 0) + day.skilled + day.unskilled,
    );
  const present = new Map<CalendarDate, number>();
  for (const day of attendance)
    present.set(day.date, (present.get(day.date) ?? 0) + day.heads);
  const days: LabourAvailabilityDay[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1))
    days.push({
      date,
      worksheet: onSheets.get(date) ?? 0,
      attendance: present.get(date) ?? 0,
    });
  return days;
}

/** Worksheet labour summed per Contractor and Department. */
export type ContractorLabour = {
  contractorId: string;
  departmentId: string;
  skilled: number;
  unskilled: number;
};

export type ContractorLabourRow = ContractorLabour & {
  contractor: string | null;
  department: string | null;
  total: number;
};

/** Contractor-wise labour, the most labour-days first, then by name. */
export function contractorWiseLabour(
  rows: readonly ContractorLabour[],
  names: {
    contractors: ReadonlyMap<string, string>;
    departments: ReadonlyMap<string, string>;
  },
): ContractorLabourRow[] {
  return rows
    .map((row) => ({
      ...row,
      contractor: names.contractors.get(row.contractorId) ?? null,
      department: names.departments.get(row.departmentId) ?? null,
      total: row.skilled + row.unskilled,
    }))
    .sort(
      (a, b) =>
        b.total - a.total ||
        (a.contractor ?? "").localeCompare(b.contractor ?? "") ||
        (a.department ?? "").localeCompare(b.department ?? ""),
    );
}

/** One machine's usage over the range, from its sheets. */
export type EquipmentUsageTotals = {
  equipmentId: string;
  name: string;
  equipmentNumber: string;
  ownership: "owned" | "rented";
  basis: "hourly" | "km" | "trip";
  sheets: number;
  /** Hundredths of an hour (hourly basis). */
  hoursHundredths: number;
  /** Hundredths of a km (km basis). */
  kmHundredths: number;
  trips: number;
  fuelOverruns: number;
  /** Paise; rented sheets only. */
  hireCost: number;
};

/** How many machines the Top Equipment chart shows. */
export const TOP_EQUIPMENT = 8;

export type EquipmentUsageSummary = {
  sheets: number;
  hours: number;
  km: number;
  trips: number;
  fuelOverruns: number;
  /** Paise of rented sheets. */
  hireCost: number;
  /** Hourly machines by work hours, at most `TOP_EQUIPMENT`. */
  topEquipment: {
    equipmentId: string;
    name: string;
    equipmentNumber: string;
    ownership: "owned" | "rented";
    hours: number;
  }[];
  /** Work hours of hourly machines by ownership. */
  ownership: {
    owned: { hours: number; sheets: number };
    rented: { hours: number; sheets: number };
  };
};

/**
 * The Equipment Usage section: totals, the top hourly machines by work
 * hours and owned against rented hours. A machine whose sheets changed
 * basis appears once per basis; only its hourly sheets count as hours.
 */
export function equipmentUsageSummary(
  machines: readonly EquipmentUsageTotals[],
): EquipmentUsageSummary {
  const sum = (pick: (machine: EquipmentUsageTotals) => number) =>
    machines.reduce((total, machine) => total + pick(machine), 0);
  const hourly = machines.filter(
    (machine) => machine.basis === "hourly" && machine.hoursHundredths > 0,
  );
  const byMachine = new Map<string, (typeof hourly)[number]>();
  for (const machine of hourly) {
    const seen = byMachine.get(machine.equipmentId);
    byMachine.set(
      machine.equipmentId,
      seen == null
        ? machine
        : {
            ...seen,
            hoursHundredths: seen.hoursHundredths + machine.hoursHundredths,
          },
    );
  }
  const split = (ownership: "owned" | "rented") => {
    const own = machines.filter(
      (machine) =>
        machine.ownership === ownership && machine.basis === "hourly",
    );
    return {
      hours: own.reduce((total, m) => total + m.hoursHundredths, 0) / 100,
      sheets: own.reduce((total, m) => total + m.sheets, 0),
    };
  };
  return {
    sheets: sum((machine) => machine.sheets),
    hours: sum((machine) => machine.hoursHundredths) / 100,
    km: sum((machine) => machine.kmHundredths) / 100,
    trips: sum((machine) => machine.trips),
    fuelOverruns: sum((machine) => machine.fuelOverruns),
    hireCost: sum((machine) => machine.hireCost),
    topEquipment: [...byMachine.values()]
      .sort(
        (a, b) =>
          b.hoursHundredths - a.hoursHundredths ||
          a.name.localeCompare(b.name) ||
          a.equipmentNumber.localeCompare(b.equipmentNumber),
      )
      .slice(0, TOP_EQUIPMENT)
      .map((machine) => ({
        equipmentId: machine.equipmentId,
        name: machine.name,
        equipmentNumber: machine.equipmentNumber,
        ownership: machine.ownership,
        hours: machine.hoursHundredths / 100,
      })),
    ownership: { owned: split("owned"), rented: split("rented") },
  };
}

/** A decimal string or number as hundredths: `"7.5"` → 750. */
export function hundredths(value: string | number | null): number {
  if (value == null) return 0;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? Math.round(number * 100) : 0;
}
