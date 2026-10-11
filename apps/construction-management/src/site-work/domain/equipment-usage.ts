import {
  conflict,
  DomainError,
  forbidden,
} from "@/src/shared-kernel/domain-error";
import { optionalText, type Decider } from "@/src/shared-kernel/approval";
import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { LocationRef } from "@/src/shared-kernel/location-ref";

import {
  EQUIPMENT_LIMITS,
  type EquipmentOwnership,
  type FuelUnit,
  type HireBasis,
  type UtilisationBasis,
  type WorkingTimeMethod,
} from "./equipment";
import { WORK_SHIFTS, type WorkShift } from "./shift";
import { SITE_WORK_DOCUMENTS } from "./site-work-documents";
import {
  decideWorksheet,
  savedApproval,
  worksheetLines,
  type WorksheetApproval,
  type WorksheetLine,
  type WorksheetLineInput,
  type WorksheetMaterialFacts,
} from "./worksheet";

/**
 * Equipment Usage sheets (CM-604, ADR CM-0016 §2, §3, §5, §9, §11, §12):
 * one machine's day on a Project — when it worked (time shifts, meter
 * readings, distance or trips), idle and breakdown time, fuel, and for
 * rented plant the hire cost. Pure rules and exact arithmetic; the
 * handlers load the facts.
 *
 * Numbers are kept as integers at their column's scale: hours, readings
 * and kilometres in hundredths ("centi"), fuel and billable quantities in
 * thousandths ("milli"), money in paise (`bigint`).
 */

export const EQUIPMENT_SHEET = SITE_WORK_DOCUMENTS.equipment_usage.naming;

// ---------------------------------------------------------------------------
// Settings (§2)
// ---------------------------------------------------------------------------

export type EquipmentSheetSettings = {
  showOperator: boolean;
  showSupervisor: boolean;
  showLocation: boolean;
  showApproxWorkDone: boolean;
  /** Legacy "Rented hour": the billable quantity override on rented sheets. */
  showBillableQty: boolean;
  showFuel: boolean;
  showRemarks: boolean;
  showFiles: boolean;
  showMaterials: boolean;
  showMeterReadings: boolean;
  showBreakdownHours: boolean;
  approvalEnabled: boolean;
};

export const EQUIPMENT_SHEET_FIELD_TOGGLES = [
  "showOperator",
  "showSupervisor",
  "showLocation",
  "showApproxWorkDone",
  "showBillableQty",
  "showFuel",
  "showRemarks",
  "showFiles",
  "showMaterials",
  "showMeterReadings",
  "showBreakdownHours",
] as const satisfies readonly (keyof EquipmentSheetSettings)[];
export type EquipmentSheetFieldToggle =
  (typeof EQUIPMENT_SHEET_FIELD_TOGGLES)[number];

export const EQUIPMENT_SHEET_TOGGLE_LABELS: Record<
  EquipmentSheetFieldToggle,
  string
> = {
  showOperator: "Operator",
  showSupervisor: "Supervisor",
  showLocation: "Location",
  showApproxWorkDone: "Approx Work Done",
  showBillableQty: "Billable quantity (rented)",
  showFuel: "Fuel consumption",
  showRemarks: "Remarks",
  showFiles: "Files",
  showMaterials: "Material consumption",
  showMeterReadings: "Meter readings",
  showBreakdownHours: "Breakdown hours",
};

/** A Project without saved settings: everything shown, approval off. */
export const DEFAULT_EQUIPMENT_SHEET_SETTINGS: Readonly<EquipmentSheetSettings> =
  Object.freeze({
    showOperator: true,
    showSupervisor: true,
    showLocation: true,
    showApproxWorkDone: true,
    showBillableQty: true,
    showFuel: true,
    showRemarks: true,
    showFiles: true,
    showMaterials: true,
    showMeterReadings: true,
    showBreakdownHours: true,
    approvalEnabled: false,
  });

// ---------------------------------------------------------------------------
// Limits and decimals
// ---------------------------------------------------------------------------

export const EQUIPMENT_SHEET_LIMITS = {
  /** Time shift rows on one sheet. */
  maxTimeShifts: 10,
  operator: 120,
  workItem: 200,
  /** Usage (Hourly) + idle + breakdown hours in a day, in hundredths. */
  dayCentiHours: 2400,
  maxTrips: 10_000,
  /** `hire_rate` / `unit_rate` are BIGINT paise. */
  maxUnitRate: EQUIPMENT_LIMITS.maxHireRate,
} as const;

/** Column shapes: whole digits and decimals. */
const HOURS = { digits: 2, scale: 2 } as const; // decimal(6,2), ≤ 24 anyway
const READING = { digits: 10, scale: 2 } as const; // decimal(12,2)
const DISTANCE = { digits: 8, scale: 2 } as const; // decimal(10,2)
const FUEL = { digits: 7, scale: 3 } as const; // decimal(10,3)
const BILLABLE = { digits: 7, scale: 3 } as const; // decimal(10,3)
const APPROX = { digits: 11, scale: 3 } as const; // decimal(14,3)

function invalid(
  code: string,
  message: string,
  details: Record<string, unknown>,
): DomainError {
  return new DomainError(code, message, { details });
}

function blank(value: string | null | undefined): boolean {
  return value == null || value.trim() === "";
}

/**
 * A non-negative decimal string as an integer at `scale` (`"8.5"` at scale
 * 2 → 850); null when blank. 400 `code` with `details` otherwise.
 */
export function scaledDecimal(
  raw: string | null | undefined,
  shape: { digits: number; scale: number },
  code: string,
  details: Record<string, unknown>,
): number | null {
  const text = raw?.trim() ?? "";
  if (text === "") return null;
  const match = new RegExp(
    `^(\\d{1,${String(shape.digits)}})(?:\\.(\\d{1,${String(shape.scale)}}))?$`,
  ).exec(text);
  if (match == null)
    throw invalid(
      code,
      shape.scale === 0
        ? "Enter a whole number."
        : `Enter a number with at most ${String(shape.scale)} decimals.`,
      details,
    );
  const fraction = (match[2] ?? "").padEnd(shape.scale, "0");
  return Number(match[1]) * 10 ** shape.scale + Number(fraction || "0");
}

/** An integer at `scale` as a decimal string at that scale (850, 2 → `"8.50"`). */
export function decimalText(value: number | bigint, scale: number): string {
  const big = BigInt(value);
  const negative = big < 0n;
  const abs = negative ? -big : big;
  const unit = 10n ** BigInt(scale);
  const whole = (abs / unit).toString();
  const fraction = (abs % unit).toString().padStart(scale, "0");
  const text = scale === 0 ? whole : `${whole}.${fraction}`;
  return negative ? `-${text}` : text;
}

/** n ÷ d rounded half-up (n ≥ 0, d > 0). */
export function divideHalfUp(n: bigint, d: bigint): bigint {
  return (n * 2n + d) / (2n * d);
}

// ---------------------------------------------------------------------------
// Time shifts (§12)
// ---------------------------------------------------------------------------

export type TimeShiftInput = { startTime: string; endTime: string };
export type TimeShift = {
  startTime: string;
  endTime: string;
  /** 1–1440; an end before the start crosses midnight. */
  minutes: number;
};

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Minutes after midnight of `HH:MM`, or null when it is not one. */
export function minuteOfDay(text: string): number | null {
  const match = HH_MM.exec(text.trim());
  if (match == null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * One shift: start and end as `HH:MM`; an end before the start crosses
 * midnight; the same start and end is refused (400 `TIME_SHIFT_EMPTY`).
 */
export function timeShift(input: TimeShiftInput, index = 0): TimeShift {
  const start = minuteOfDay(input.startTime);
  const end = minuteOfDay(input.endTime);
  if (start == null)
    throw invalid("TIME_SHIFT_INVALID", "Enter the start as HH:MM.", {
      field: "startTime",
      index,
    });
  if (end == null)
    throw invalid("TIME_SHIFT_INVALID", "Enter the end as HH:MM.", {
      field: "endTime",
      index,
    });
  if (start === end)
    throw invalid("TIME_SHIFT_EMPTY", "The end must differ from the start.", {
      field: "endTime",
      index,
    });
  return {
    startTime: input.startTime.trim(),
    endTime: input.endTime.trim(),
    minutes: end > start ? end - start : 1440 - start + end,
  };
}

/**
 * Whether two shifts overlap on the clock. A sheet covers one day, so a
 * shift that crosses midnight wraps onto the same day's early hours:
 * 22:00–02:00 overlaps 01:00–03:00. Touching ends (10:00–12:00, 12:00–14:00)
 * do not overlap.
 */
export function shiftsOverlap(a: TimeShift, b: TimeShift): boolean {
  const aStart = minuteOfDay(a.startTime) ?? 0;
  const bStart = minuteOfDay(b.startTime) ?? 0;
  for (const shift of [-1440, 0, 1440]) {
    const start = bStart + shift;
    if (aStart < start + b.minutes && start < aStart + a.minutes) return true;
  }
  return false;
}

/** The shift rows: at most ten, none overlapping (400 `TIME_SHIFTS_OVERLAP`). */
export function timeShifts(inputs: readonly TimeShiftInput[]): TimeShift[] {
  if (inputs.length > EQUIPMENT_SHEET_LIMITS.maxTimeShifts)
    throw invalid(
      "TOO_MANY_TIME_SHIFTS",
      `Add at most ${String(EQUIPMENT_SHEET_LIMITS.maxTimeShifts)} time shifts.`,
      { field: "timeShifts" },
    );
  const shifts = inputs.map((input, index) => timeShift(input, index));
  shifts.forEach((shift, index) => {
    const other = shifts.findIndex(
      (earlier, at) => at < index && shiftsOverlap(earlier, shift),
    );
    if (other >= 0)
      throw invalid(
        "TIME_SHIFTS_OVERLAP",
        `This shift overlaps shift ${String(other + 1)}.`,
        { field: "startTime", index, otherIndex: other },
      );
  });
  return shifts;
}

/** Σ minutes ÷ 60 in hundredths of an hour, rounded half-up (50 min → 83). */
export function shiftCentiHours(
  shifts: readonly { minutes: number }[],
): number {
  const minutes = shifts.reduce((sum, shift) => sum + shift.minutes, 0);
  return Math.floor((minutes * 100 + 30) / 60);
}

// ---------------------------------------------------------------------------
// Meter readings (§12)
// ---------------------------------------------------------------------------

export type MeterReading = {
  /** Hundredths. */
  opening: number;
  closing: number;
  /** closing − opening: hours (Hourly) or km (Km). */
  delta: number;
};

/** Opening and closing, closing ≥ opening (400 `METER_CLOSING_BELOW_OPENING`). */
export function meterReading(
  openingRaw: string | null | undefined,
  closingRaw: string | null | undefined,
): MeterReading {
  const opening = scaledDecimal(openingRaw, READING, "METER_READING_INVALID", {
    field: "openingReading",
  });
  const closing = scaledDecimal(closingRaw, READING, "METER_READING_INVALID", {
    field: "closingReading",
  });
  if (opening == null)
    throw invalid("METER_READING_REQUIRED", "Enter the opening reading.", {
      field: "openingReading",
    });
  if (closing == null)
    throw invalid("METER_READING_REQUIRED", "Enter the closing reading.", {
      field: "closingReading",
    });
  if (closing < opening)
    throw invalid(
      "METER_CLOSING_BELOW_OPENING",
      "The closing reading cannot be below the opening reading.",
      { field: "closingReading" },
    );
  return { opening, closing, delta: closing - opening };
}

/**
 * The gap between this sheet's opening and the previous closing reading
 * (opening − previous, in hundredths): a warning, never an error. Null
 * without a previous reading; 0 when they match.
 */
export function meterGap(
  opening: number,
  previousClosing: number | null,
): number | null {
  return previousClosing == null ? null : opening - previousClosing;
}

// ---------------------------------------------------------------------------
// Usage by basis (§12)
// ---------------------------------------------------------------------------

export type UsageInput = {
  basis: UtilisationBasis;
  method: WorkingTimeMethod;
  /** Meter readings shown on the form (the setting). */
  meterShown: boolean;
  shifts: readonly TimeShift[];
  meter: MeterReading | null;
  /** Typed: Hourly with the meter method but the meter hidden. */
  typedHours: number | null;
  /** Typed: Km without a meter. */
  typedDistance: number | null;
  trips: number | null;
};

export type Usage = {
  /** Hourly only, hundredths. */
  usageHours: number | null;
  /** Km only, hundredths. */
  distanceKm: number | null;
  /** Trip only. */
  trips: number | null;
  /** Σ time shift hours, hundredths; null without shifts recorded. */
  shiftHours: number | null;
  /** Both: shift hours ≠ the meter's delta (a warning). */
  meterMismatch: { shiftHours: number; meterHours: number } | null;
};

/** Whether the method records time shifts / meter readings. */
export function usesShifts(method: WorkingTimeMethod): boolean {
  return method === "time_shifts" || method === "both";
}

export function usesMeter(method: WorkingTimeMethod, meterShown: boolean) {
  return meterShown && (method === "meter_reading" || method === "both");
}

/**
 * What the sheet measured (§12):
 * - Hourly: the shifts (Time Shifts, Both) or the meter's delta (Meter
 *   Reading; typed hours when the meter is hidden). With Both a mismatch
 *   between the shifts and the meter is reported.
 * - Km: the meter's delta (Meter Reading), else the typed distance.
 * - Trip: the trip count.
 */
export function sheetUsage(input: UsageInput): Usage {
  const shiftHours = usesShifts(input.method)
    ? shiftCentiHours(input.shifts)
    : null;
  const meter = usesMeter(input.method, input.meterShown) ? input.meter : null;
  const usage: Usage = {
    usageHours: null,
    distanceKm: null,
    trips: null,
    shiftHours,
    meterMismatch: null,
  };
  switch (input.basis) {
    case "hourly":
      if (input.method === "meter_reading")
        usage.usageHours = meter?.delta ?? input.typedHours ?? 0;
      else usage.usageHours = shiftHours ?? 0;
      if (
        input.method === "both" &&
        meter != null &&
        shiftHours != null &&
        meter.delta !== shiftHours
      )
        usage.meterMismatch = { shiftHours, meterHours: meter.delta };
      return usage;
    case "km":
      usage.distanceKm =
        input.method === "meter_reading" && meter != null
          ? meter.delta
          : (input.typedDistance ?? 0);
      return usage;
    case "trip":
      usage.trips = input.trips ?? 0;
      return usage;
  }
}

/**
 * Usage hours (Hourly only) + idle + breakdown ≤ 24 (400
 * `SHEET_HOURS_OVER_24`, with the total in hundredths).
 */
export function assertDayCap(
  usageHours: number | null,
  idleHours: number,
  breakdownHours: number,
): void {
  const total = (usageHours ?? 0) + idleHours + breakdownHours;
  if (total > EQUIPMENT_SHEET_LIMITS.dayCentiHours)
    throw invalid(
      "SHEET_HOURS_OVER_24",
      `Usage, idle and breakdown hours add up to ${decimalText(total, 2)}. A day has 24.`,
      { field: "idleHours", totalHours: decimalText(total, 2) },
    );
}

/** The usage as fuel efficiency reads it, in thousandths of a unit. */
export function usageMilli(basis: UtilisationBasis, usage: Usage): number {
  switch (basis) {
    case "hourly":
      return (usage.usageHours ?? 0) * 10;
    case "km":
      return (usage.distanceKm ?? 0) * 10;
    case "trip":
      return (usage.trips ?? 0) * 1000;
  }
}

/**
 * Fuel overrun (§12): fuel ÷ usage (hours, km or trips) above the
 * equipment's Expected Fuel Efficiency. Only when fuel, efficiency and a
 * usage above zero all exist. All three in thousandths.
 */
export function fuelOverrun(input: {
  fuelMilli: number | null;
  usageMilli: number;
  efficiencyMilli: number | null;
}): boolean {
  const { fuelMilli, usageMilli: used, efficiencyMilli } = input;
  if (fuelMilli == null || efficiencyMilli == null || used <= 0) return false;
  return BigInt(fuelMilli) * 1000n > BigInt(efficiencyMilli) * BigInt(used);
}

// ---------------------------------------------------------------------------
// Hire cost (§12, rented only)
// ---------------------------------------------------------------------------

export type HireTerms = {
  hireBasis: HireBasis;
  /** Paise per hire-basis unit. */
  hireRate: bigint;
  /** Idle hours count towards an hourly hire. */
  idleChargeable: boolean;
};

/** Days in the sheet date's month (28–31). */
export function daysInMonth(date: CalendarDate): number {
  const [year, month] = date.split("-").map(Number) as [number, number];
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * The default Unit Rate in paise: the hire rate; for a monthly hire, one
 * day's share of it — rate ÷ days in the sheet's month, half-up — so the
 * billable quantity of a monthly hire is days, like a daily one.
 */
export function defaultUnitRate(terms: HireTerms, sheetDate: CalendarDate) {
  return terms.hireBasis === "monthly"
    ? divideHalfUp(terms.hireRate, BigInt(daysInMonth(sheetDate)))
    : terms.hireRate;
}

/**
 * The default billable quantity in thousandths (§12): hourly — the hours
 * worked plus idle hours when chargeable; trip — the trips; daily and
 * monthly — one day.
 */
export function defaultBillableMilli(
  terms: HireTerms,
  worked: { hours: number; idleHours: number; trips: number },
): bigint {
  switch (terms.hireBasis) {
    case "hourly":
      return (
        BigInt(worked.hours + (terms.idleChargeable ? worked.idleHours : 0)) *
        10n
      );
    case "trip":
      return BigInt(worked.trips) * 1000n;
    case "daily":
    case "monthly":
      return 1000n;
  }
}

/** Hire Cost = Unit Rate × billable quantity, in paise, half-up. */
export function hireCost(unitRate: bigint, billableMilli: bigint): bigint {
  return divideHalfUp(unitRate * billableMilli, 1000n);
}

export type SheetHire = {
  unitRate: bigint;
  /** Thousandths. */
  billableMilli: bigint;
  hireCost: bigint;
};

/**
 * A rented sheet's hire: the defaults unless overridden (`null` = the
 * default).
 */
export function sheetHire(
  terms: HireTerms,
  sheetDate: CalendarDate,
  worked: { hours: number; idleHours: number; trips: number },
  overrides: { unitRate: bigint | null; billableMilli: bigint | null },
): SheetHire {
  const unitRate = overrides.unitRate ?? defaultUnitRate(terms, sheetDate);
  const billableMilli =
    overrides.billableMilli ?? defaultBillableMilli(terms, worked);
  return {
    unitRate,
    billableMilli,
    hireCost: hireCost(unitRate, billableMilli),
  };
}

// ---------------------------------------------------------------------------
// Content (§12)
// ---------------------------------------------------------------------------

export const FUEL_BORNE_BY = ["company", "hire_party"] as const;
export type FuelBorneBy = (typeof FUEL_BORNE_BY)[number];

export const FUEL_BORNE_BY_LABELS: Record<FuelBorneBy, string> = {
  company: "Company",
  hire_party: "Hire party",
};

/** What the sheet copies or reads from its equipment at save. */
export type SheetEquipmentFacts = {
  id: string;
  ownership: EquipmentOwnership;
  utilisationBasis: UtilisationBasis;
  workingTimeMethod: WorkingTimeMethod;
  fuelUnit: FuelUnit | null;
  /** Decimal string, fuel units per hour, km or trip. */
  expectedFuelEfficiency: string | null;
  /** Rented only. */
  hire: HireTerms | null;
};

export type EquipmentSheetInput = {
  sheetDate: CalendarDate;
  shift: string;
  operatorName?: string | null;
  supervisorUserId?: string | null;
  contractorId?: string | null;
  departmentId?: string | null;
  workItem?: string | null;
  /** Already shaped by `locationRef`; the resolver checks the Project. */
  siteLocation?: LocationRef | null;
  timeShifts?: readonly TimeShiftInput[];
  openingReading?: string | null;
  closingReading?: string | null;
  /** Hourly, meter method, meter hidden: the hours typed. */
  usageHours?: string | null;
  /** Km without a meter: the distance typed. */
  distanceKm?: string | null;
  trips?: number | null;
  idleHours?: string | null;
  breakdownHours?: string | null;
  approxWorkQty?: string | null;
  approxWorkUnitId?: string | null;
  fuelQty?: string | null;
  fuelBorneBy?: string | null;
  /** Paise; null = the default. Needs Financial. */
  unitRate?: number | null;
  /** Decimal string; null = the default. Needs Financial and the setting. */
  billableQty?: string | null;
  remark?: string | null;
  materials?: readonly WorksheetLineInput[];
};

/** What the save writes (besides number, approval and bookkeeping). */
export type EquipmentSheetContent = {
  sheetDate: CalendarDate;
  shift: WorkShift;
  operatorName: string | null;
  supervisorUserId: string | null;
  contractorId: string | null;
  departmentId: string | null;
  workItem: string | null;
  siteLocation: LocationRef | null;
  timeShifts: TimeShift[];
  /** Decimal strings, two decimals. */
  openingReading: string | null;
  closingReading: string | null;
  usageHours: string | null;
  distanceKm: string | null;
  trips: number | null;
  idleHours: string;
  breakdownHours: string;
  approxWorkQty: string | null;
  approxWorkUnitId: string | null;
  /** Three decimals, the equipment's fuel unit. */
  fuelQty: string | null;
  fuelBorneBy: FuelBorneBy | null;
  fuelOverrun: boolean;
  /** Rented only: paise, three-decimal quantity, paise. */
  unitRate: bigint | null;
  billableQty: string | null;
  hireCost: bigint | null;
  remark: string | null;
  lines: WorksheetLine[];
};

/** The facts the rules read, loaded by the handler for the input's ids. */
export type EquipmentSheetFacts = {
  equipment: SheetEquipmentFacts;
  /** Financial on Equipment Usage at the Project. */
  financial: boolean;
  /** The chosen supervisor when they may supervise on the Project. */
  supervisor: { userId: string } | null;
  contractor: {
    id: string;
    isActive: boolean;
    onProject: boolean;
    departmentIds: readonly string[];
  } | null;
  department: { id: string; disabled: boolean } | null;
  unit: { id: string; disabled: boolean } | null;
  materials: ReadonlyMap<string, WorksheetMaterialFacts>;
};

function text(
  raw: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const value = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (value.length > max)
    throw invalid("TEXT_TOO_LONG", `Use at most ${String(max)} characters.`, {
      field,
    });
  return value === "" ? null : value;
}

function centiText(value: number | null): string | null {
  return value == null ? null : decimalText(value, 2);
}

function centiOf(value: string | null | undefined): number {
  return value == null ? 0 : Math.round(Number(value) * 100);
}

function milliOf(value: string | null | undefined): number | null {
  return value == null ? null : Math.round(Number(value) * 1000);
}

/**
 * The content a create or an edit saves (§2, §12). Work Shift\* always;
 * each shown field is validated and stored, and a hidden one is neither:
 * it keeps what the sheet already had (`previous`, on edit) or stays empty
 * (create). The usage follows the equipment's basis and method; the hire
 * cost is computed for rented equipment, from the defaults unless a
 * Financial member overrides the unit rate or the billable quantity
 * (without Financial an override is 403).
 */
export function equipmentSheetContent(
  input: EquipmentSheetInput,
  settings: EquipmentSheetSettings,
  facts: EquipmentSheetFacts,
  previous: EquipmentSheetContent | null = null,
): { content: EquipmentSheetContent; usage: Usage } {
  const { equipment } = facts;
  const shift = input.shift as WorkShift;
  if (!WORK_SHIFTS.includes(shift))
    throw invalid("WORK_SHIFT_REQUIRED", "Choose the Work Shift.", {
      field: "shift",
    });

  // Hire overrides need Financial, whatever the settings (§10, CM-603).
  const sentRate = input.unitRate != null;
  const sentQty = !blank(input.billableQty);
  if ((sentRate || sentQty) && !facts.financial)
    throw forbidden(
      "PERMISSION_DENIED",
      "You do not have permission to set hire rates. Ask the Owner for Financial on Equipment Usage.",
    );
  if ((sentRate || sentQty) && equipment.hire == null)
    throw invalid(
      "HIRE_DETAILS_RENTED_ONLY",
      "Only rented equipment has a unit rate and billable quantity.",
      { field: sentRate ? "unitRate" : "billableQty" },
    );

  const operatorName = settings.showOperator
    ? text(input.operatorName, EQUIPMENT_SHEET_LIMITS.operator, "operatorName")
    : (previous?.operatorName ?? null);

  let supervisorUserId = previous?.supervisorUserId ?? null;
  if (settings.showSupervisor) {
    supervisorUserId = blank(input.supervisorUserId)
      ? null
      : (input.supervisorUserId ?? null);
    const same = previous?.supervisorUserId === supervisorUserId;
    if (supervisorUserId != null && facts.supervisor == null && !same)
      throw invalid(
        "SUPERVISOR_NOT_FOUND",
        "Choose a Team Member on this Project as supervisor.",
        { field: "supervisorUserId" },
      );
  }

  // Contractor and Department: optional, checked like worksheets when given.
  let contractorId: string | null = null;
  if (!blank(input.contractorId)) {
    const contractor = facts.contractor;
    const same = previous?.contractorId === input.contractorId;
    if (contractor == null || (!contractor.isActive && !same))
      throw invalid("CONTRACTOR_NOT_FOUND", "This Contractor was not found.", {
        field: "contractorId",
      });
    if (!contractor.onProject)
      throw invalid(
        "CONTRACTOR_NOT_ON_PROJECT",
        "This Contractor is not assigned to the Project. Add them under Resources first.",
        { field: "contractorId" },
      );
    contractorId = contractor.id;
  }
  let departmentId: string | null = null;
  if (!blank(input.departmentId)) {
    // A Department is one of the Contractor's, as on worksheets (§7).
    if (contractorId == null || facts.contractor == null)
      throw invalid(
        "CONTRACTOR_REQUIRED",
        "Choose the Contractor whose Department this is.",
        { field: "contractorId" },
      );
    const department = facts.department;
    const same = previous?.departmentId === input.departmentId;
    if (department == null || (department.disabled && !same))
      throw invalid("DEPARTMENT_NOT_FOUND", "This Department was not found.", {
        field: "departmentId",
      });
    if (!facts.contractor.departmentIds.includes(department.id))
      throw invalid(
        "DEPARTMENT_NOT_CONTRACTORS",
        "This Department is not one of the Contractor's Departments.",
        { field: "departmentId" },
      );
    departmentId = department.id;
  }

  const workItem = text(
    input.workItem,
    EQUIPMENT_SHEET_LIMITS.workItem,
    "workItem",
  );

  const siteLocation = settings.showLocation
    ? (input.siteLocation ?? null)
    : (previous?.siteLocation ?? null);

  // Utilisation.
  const method = equipment.workingTimeMethod;
  const basis = equipment.utilisationBasis;
  const shifts = usesShifts(method) ? timeShifts(input.timeShifts ?? []) : [];
  let meter: MeterReading | null = null;
  let openingReading = previous?.openingReading ?? null;
  let closingReading = previous?.closingReading ?? null;
  if (settings.showMeterReadings) {
    openingReading = null;
    closingReading = null;
    if (usesMeter(method, true)) {
      meter = meterReading(input.openingReading, input.closingReading);
      openingReading = decimalText(meter.opening, 2);
      closingReading = decimalText(meter.closing, 2);
    }
  }
  const typedHours =
    basis === "hourly" &&
    method === "meter_reading" &&
    !settings.showMeterReadings
      ? scaledDecimal(input.usageHours, HOURS, "USAGE_HOURS_INVALID", {
          field: "usageHours",
        })
      : null;
  if (
    basis === "hourly" &&
    method === "meter_reading" &&
    !settings.showMeterReadings &&
    typedHours == null
  )
    throw invalid("USAGE_HOURS_REQUIRED", "Enter the hours it worked.", {
      field: "usageHours",
    });
  const typedDistance =
    basis === "km" && !(method === "meter_reading" && meter != null)
      ? scaledDecimal(input.distanceKm, DISTANCE, "DISTANCE_INVALID", {
          field: "distanceKm",
        })
      : null;
  if (
    basis === "km" &&
    !(method === "meter_reading" && meter != null) &&
    typedDistance == null
  )
    throw invalid("DISTANCE_REQUIRED", "Enter the distance in km.", {
      field: "distanceKm",
    });
  let trips: number | null = null;
  if (basis === "trip") {
    trips = input.trips ?? null;
    if (trips == null)
      throw invalid("TRIPS_REQUIRED", "Enter the number of trips.", {
        field: "trips",
      });
    if (
      !Number.isInteger(trips) ||
      trips < 0 ||
      trips > EQUIPMENT_SHEET_LIMITS.maxTrips
    )
      throw invalid("TRIPS_INVALID", "Enter a whole number of 0 or more.", {
        field: "trips",
      });
  }
  const usage = sheetUsage({
    basis,
    method,
    meterShown: settings.showMeterReadings,
    shifts,
    meter,
    typedHours,
    typedDistance,
    trips,
  });

  const idle =
    scaledDecimal(input.idleHours, HOURS, "IDLE_HOURS_INVALID", {
      field: "idleHours",
    }) ?? 0;
  const breakdown = settings.showBreakdownHours
    ? (scaledDecimal(input.breakdownHours, HOURS, "BREAKDOWN_HOURS_INVALID", {
        field: "breakdownHours",
      }) ?? 0)
    : centiOf(previous?.breakdownHours);
  assertDayCap(usage.usageHours, idle, breakdown);

  // Approx Work Done: a quantity needs a unit.
  let approxWorkQty = previous?.approxWorkQty ?? null;
  let approxWorkUnitId = previous?.approxWorkUnitId ?? null;
  if (settings.showApproxWorkDone) {
    approxWorkQty = null;
    approxWorkUnitId = null;
    const qty = scaledDecimal(
      input.approxWorkQty,
      APPROX,
      "APPROX_WORK_QTY_INVALID",
      {
        field: "approxWorkQty",
      },
    );
    if (qty === 0)
      throw invalid(
        "APPROX_WORK_QTY_INVALID",
        "Enter a quantity more than 0.",
        {
          field: "approxWorkQty",
        },
      );
    if (qty != null) {
      approxWorkQty = decimalText(qty, 3);
      if (blank(input.approxWorkUnitId))
        throw invalid(
          "APPROX_WORK_UNIT_REQUIRED",
          "Choose the unit of the work done.",
          { field: "approxWorkUnitId" },
        );
      const unit = facts.unit;
      const same = previous?.approxWorkUnitId === input.approxWorkUnitId;
      if (unit == null || (unit.disabled && !same))
        throw invalid("UNIT_NOT_FOUND", "This unit was not found.", {
          field: "approxWorkUnitId",
        });
      approxWorkUnitId = unit.id;
    }
  }

  // Fuel: recorded only (owner); borne by the Company or the hire party.
  let fuelQty = previous?.fuelQty ?? null;
  let fuelBorneBy = previous?.fuelBorneBy ?? null;
  if (settings.showFuel) {
    const fuel = scaledDecimal(input.fuelQty, FUEL, "FUEL_QTY_INVALID", {
      field: "fuelQty",
    });
    fuelQty = fuel == null ? null : decimalText(fuel, 3);
    fuelBorneBy = null;
    if (fuel != null) {
      const borne = input.fuelBorneBy ?? null;
      if (equipment.ownership === "owned") {
        if (borne === "hire_party")
          throw invalid(
            "FUEL_BORNE_BY_RENTED_ONLY",
            "Only rented equipment has a hire party to bear the fuel.",
            { field: "fuelBorneBy" },
          );
        fuelBorneBy = "company";
      } else {
        if (borne !== "company" && borne !== "hire_party")
          throw invalid(
            "FUEL_BORNE_BY_REQUIRED",
            "Choose who bears the fuel.",
            { field: "fuelBorneBy" },
          );
        fuelBorneBy = borne;
      }
    }
  }
  const overrun = fuelOverrun({
    fuelMilli: milliOf(fuelQty),
    usageMilli: usageMilli(basis, usage),
    efficiencyMilli: milliOf(equipment.expectedFuelEfficiency),
  });

  // Hire cost (rented only).
  let unitRate: bigint | null = null;
  let billableQty: string | null = null;
  let cost: bigint | null = null;
  if (equipment.hire != null) {
    let rateOverride: bigint | null = null;
    if (sentRate) {
      const rate = input.unitRate ?? 0;
      if (
        !Number.isSafeInteger(rate) ||
        rate < 0 ||
        rate > EQUIPMENT_SHEET_LIMITS.maxUnitRate
      )
        throw invalid("UNIT_RATE_INVALID", "Enter a rate of 0 or more.", {
          field: "unitRate",
        });
      rateOverride = BigInt(rate);
    }
    let qtyOverride: bigint | null = null;
    if (sentQty && settings.showBillableQty) {
      const qty = scaledDecimal(
        input.billableQty,
        BILLABLE,
        "BILLABLE_QTY_INVALID",
        {
          field: "billableQty",
        },
      );
      qtyOverride = qty == null ? null : BigInt(qty);
    }
    // What this member cannot see or set stays as an earlier override left it.
    const kept =
      previous == null
        ? { unitRate: null, billableMilli: null }
        : previousHireOverrides(previous, equipment.hire, basis);
    if (rateOverride == null && !facts.financial) rateOverride = kept.unitRate;
    if (qtyOverride == null && (!facts.financial || !settings.showBillableQty))
      qtyOverride = kept.billableMilli;
    const hire = sheetHire(
      equipment.hire,
      input.sheetDate,
      {
        hours: workedHours(basis, usage),
        idleHours: idle,
        trips: usage.trips ?? 0,
      },
      { unitRate: rateOverride, billableMilli: qtyOverride },
    );
    unitRate = hire.unitRate;
    billableQty = decimalText(hire.billableMilli, 3);
    cost = hire.hireCost;
  }

  const lines = settings.showMaterials
    ? worksheetLines(
        input.materials ?? [],
        facts.materials,
        previous?.lines ?? [],
      )
    : (previous?.lines ?? []);

  const remark = settings.showRemarks
    ? optionalText(input.remark, "remark")
    : (previous?.remark ?? null);

  return {
    usage,
    content: {
      sheetDate: input.sheetDate,
      shift,
      operatorName,
      supervisorUserId,
      contractorId,
      departmentId,
      workItem,
      siteLocation,
      timeShifts: shifts,
      openingReading,
      closingReading,
      usageHours: centiText(usage.usageHours),
      distanceKm: centiText(usage.distanceKm),
      trips: usage.trips,
      idleHours: decimalText(idle, 2),
      breakdownHours: decimalText(breakdown, 2),
      approxWorkQty,
      approxWorkUnitId,
      fuelQty,
      fuelBorneBy,
      fuelOverrun: overrun,
      unitRate,
      billableQty,
      hireCost: cost,
      remark,
      lines,
    },
  };
}

/**
 * The overrides a saved rented sheet carries: its unit rate and billable
 * quantity where they differ from the defaults its own figures give (null
 * where they match). An edit by a member without Financial, or with the
 * billable quantity hidden, keeps them instead of resetting to defaults.
 */
export function previousHireOverrides(
  previous: EquipmentSheetContent,
  terms: HireTerms,
  basis: UtilisationBasis,
): { unitRate: bigint | null; billableMilli: bigint | null } {
  const rateDefault = defaultUnitRate(terms, previous.sheetDate);
  const hours =
    basis === "hourly"
      ? centiOf(previous.usageHours)
      : previous.timeShifts.length === 0
        ? 0
        : shiftCentiHours(previous.timeShifts);
  const qtyDefault = defaultBillableMilli(terms, {
    hours,
    idleHours: centiOf(previous.idleHours),
    trips: previous.trips ?? 0,
  });
  const qty = milliOf(previous.billableQty);
  return {
    unitRate:
      previous.unitRate != null && previous.unitRate !== rateDefault
        ? previous.unitRate
        : null,
    billableMilli:
      qty != null && BigInt(qty) !== qtyDefault ? BigInt(qty) : null,
  };
}

/**
 * The hours an hourly hire bills before idle: the usage hours on Hourly
 * equipment, or the time-shift hours on Km and Trip equipment (0 without
 * shifts). In hundredths.
 */
export function workedHours(basis: UtilisationBasis, usage: Usage): number {
  return basis === "hourly" ? (usage.usageHours ?? 0) : (usage.shiftHours ?? 0);
}

/** A sheet date is never in the future. */
export function assertSheetDateNotFuture(
  sheetDate: CalendarDate,
  today: CalendarDate,
): void {
  if (sheetDate > today)
    throw invalid(
      "SHEET_DATE_IN_FUTURE",
      "An Equipment Usage sheet cannot be dated after today.",
      { field: "sheetDate" },
    );
}

/** One sheet per equipment, date and shift (409 `EQUIPMENT_SHEET_EXISTS`). */
export function equipmentSheetExists(): DomainError {
  return conflict(
    "EQUIPMENT_SHEET_EXISTS",
    "This equipment already has a usage sheet for that date and shift.",
    { field: "shift" },
  );
}

// ---------------------------------------------------------------------------
// Approval (§3): exactly the worksheet's rules, with this document's name.
// ---------------------------------------------------------------------------

export type EquipmentSheetApproval = WorksheetApproval;

export { savedApproval };

/**
 * Approve, or reject with a reason: only a pending sheet (409
 * `EQUIPMENT_SHEET_NOT_PENDING`).
 */
export function decideEquipmentSheet(
  current: EquipmentSheetApproval,
  decision: { approve: true } | { approve: false; reason: string },
  by: Decider,
): EquipmentSheetApproval {
  try {
    return decideWorksheet(current, decision, by);
  } catch (error) {
    if (error instanceof DomainError && error.code === "WORKSHEET_NOT_PENDING")
      throw conflict(
        `${EQUIPMENT_SHEET.code}_NOT_PENDING`,
        current.status === "not_required"
          ? `This ${EQUIPMENT_SHEET.label} does not need approval.`
          : `This ${EQUIPMENT_SHEET.label} is ${current.status}, not pending.`,
        { status: current.status },
      );
    throw error;
  }
}

/** Whether a sheet accrues hire now (§12): rented, and approved or not needing it. */
export function accruesHire(
  ownership: EquipmentOwnership,
  status: EquipmentSheetApproval["status"],
): boolean {
  return (
    ownership === "rented" &&
    (status === "approved" || status === "not_required")
  );
}

// ---------------------------------------------------------------------------
// Duplicate and Save & Add New (§9, §12)
// ---------------------------------------------------------------------------

/**
 * What Duplicate copies (§12): everything but the readings, files and
 * approval, dated today; the opening reading becomes the last closing.
 */
export function duplicateSheetOf(
  source: EquipmentSheetContent,
  today: CalendarDate,
  lastClosing: string | null,
): EquipmentSheetContent {
  return {
    ...source,
    sheetDate: today,
    openingReading: lastClosing,
    closingReading: null,
    timeShifts: source.timeShifts.map((shift) => ({ ...shift })),
    lines: source.lines.map((line) => ({ ...line })),
  };
}

/** What Save & Add New keeps: the date, shift and supervisor. */
export function addNewSheetFrom(content: {
  sheetDate: CalendarDate;
  shift: WorkShift;
  supervisorUserId: string | null;
}) {
  return {
    sheetDate: content.sheetDate,
    shift: content.shift,
    supervisorUserId: content.supervisorUserId,
  };
}
