import { DomainError } from "@/src/shared-kernel/domain-error";
import type {
  EquipmentOwnership,
  FuelUnit,
  HireBasis,
  UtilisationBasis,
  WorkingTimeMethod,
} from "@/src/site-work/domain/equipment";
import {
  decimalText,
  defaultBillableMilli,
  defaultUnitRate,
  equipmentSheetContent,
  EQUIPMENT_SHEET_LIMITS,
  fuelOverrun,
  hireCost,
  meterGap,
  scaledDecimal,
  sheetUsage,
  timeShift,
  timeShifts,
  usageMilli,
  usesMeter,
  usesShifts,
  workedHours,
  type EquipmentSheetSettings,
  type HireTerms,
  type MeterReading,
  type TimeShift,
  type Usage,
} from "@/src/site-work/domain/equipment-usage";

/**
 * The usage-sheet form's live figures (CM-604): the same pure rules the
 * server applies, run on what is typed so far — shift hours, the meter's
 * delta and gap, the 24-hour cap, the fuel overrun and the hire preview.
 */

/** The machine as the form knows it: from the sheet options, or the sheet. */
export type SheetMachine = {
  id: string;
  name: string;
  equipmentNumber: string;
  ownership: EquipmentOwnership;
  utilisationBasis: UtilisationBasis;
  workingTimeMethod: WorkingTimeMethod;
  fuelUnit: FuelUnit | null;
  expectedFuelEfficiency: string | null;
  hireBasis: HireBasis | null;
  /** Paise; null without Financial. */
  hireRate: number | null;
  idleChargeable: boolean;
  hirePartyName: string | null;
  /** The previous closing reading (two decimals) and its date. */
  lastClosing: { reading: string; sheetDate: string } | null;
};

export type LiveValues = {
  sheetDate: string;
  timeShifts: { startTime: string; endTime: string }[];
  openingReading: string;
  closingReading: string;
  usageHours: string;
  distanceKm: string;
  trips: string;
  idleHours: string;
  breakdownHours: string;
  fuelQty: string;
  /** Rupees as typed. */
  unitRate: string;
  billableQty: string;
};

export type LiveFigures = {
  /** Per shift row: `"4.50"` hours, or null while incomplete or invalid. */
  rowHours: (string | null)[];
  usage: Usage | null;
  /** Usage (Hourly) + idle + breakdown, hundredths. */
  dayTotal: number;
  overCap: boolean;
  /** closing − opening, hundredths, once both are typed and in order. */
  meterDelta: number | null;
  /** opening − previous closing, hundredths. */
  gap: number | null;
  /** fuel ÷ usage, as text, when both exist. */
  fuelRate: string | null;
  overrun: boolean;
  hire: {
    defaultUnitRate: bigint;
    defaultBillableMilli: bigint;
    unitRate: bigint;
    billableMilli: bigint;
    hireCost: bigint;
  } | null;
};

const HOURS = { digits: 2, scale: 2 };
const READING = { digits: 10, scale: 2 };
const DISTANCE = { digits: 8, scale: 2 };
const FUEL = { digits: 7, scale: 3 };
const BILLABLE = { digits: 7, scale: 3 };

/** A decimal read leniently: null when blank or not a number yet. */
function lenient(
  raw: string,
  shape: { digits: number; scale: number },
): number | null {
  try {
    return scaledDecimal(raw, shape, "X", {});
  } catch {
    return null;
  }
}

export function hireTerms(machine: SheetMachine): HireTerms | null {
  return machine.ownership === "rented" &&
    machine.hireBasis != null &&
    machine.hireRate != null
    ? {
        hireBasis: machine.hireBasis,
        hireRate: BigInt(machine.hireRate),
        idleChargeable: machine.idleChargeable,
      }
    : null;
}

export function liveFigures(
  values: LiveValues,
  machine: SheetMachine,
  settings: EquipmentSheetSettings,
): LiveFigures {
  const method = machine.workingTimeMethod;
  const basis = machine.utilisationBasis;
  const rows = values.timeShifts.map((row): TimeShift | null => {
    try {
      return timeShift(row);
    } catch {
      return null;
    }
  });
  const shifts = rows.filter((row): row is TimeShift => row != null);
  const opening = lenient(values.openingReading, READING);
  const closing = lenient(values.closingReading, READING);
  const meter: MeterReading | null =
    opening != null && closing != null && closing >= opening
      ? { opening, closing, delta: closing - opening }
      : null;
  const tripsText = values.trips.trim();
  const trips = /^\d{1,5}$/.test(tripsText) ? Number(tripsText) : null;
  const usage = sheetUsage({
    basis,
    method,
    meterShown: settings.showMeterReadings,
    shifts: usesShifts(method) ? shifts : [],
    meter,
    typedHours: lenient(values.usageHours, HOURS),
    typedDistance: lenient(values.distanceKm, DISTANCE),
    trips,
  });
  const idle = lenient(values.idleHours, HOURS) ?? 0;
  const breakdown = settings.showBreakdownHours
    ? (lenient(values.breakdownHours, HOURS) ?? 0)
    : 0;
  const dayTotal = (usage.usageHours ?? 0) + idle + breakdown;
  const fuel = settings.showFuel ? lenient(values.fuelQty, FUEL) : null;
  const efficiency =
    machine.expectedFuelEfficiency == null
      ? null
      : Math.round(Number(machine.expectedFuelEfficiency) * 1000);
  const used = usageMilli(basis, usage);
  const terms = hireTerms(machine);
  let hire: LiveFigures["hire"] = null;
  if (terms != null && values.sheetDate !== "") {
    const worked = {
      hours: workedHours(basis, usage),
      idleHours: idle,
      trips: usage.trips ?? 0,
    };
    const rateDefault = defaultUnitRate(terms, values.sheetDate);
    const qtyDefault = defaultBillableMilli(terms, worked);
    const typedRate = values.unitRate.trim();
    const rate = /^\d{1,11}(\.\d{1,2})?$/.test(typedRate)
      ? BigInt(Math.round(Number(typedRate) * 100))
      : rateDefault;
    const typedQty = settings.showBillableQty
      ? lenient(values.billableQty, BILLABLE)
      : null;
    const qty = typedQty == null ? qtyDefault : BigInt(typedQty);
    hire = {
      defaultUnitRate: rateDefault,
      defaultBillableMilli: qtyDefault,
      unitRate: rate,
      billableMilli: qty,
      hireCost: hireCost(rate, qty),
    };
  }
  return {
    rowHours: rows.map((row) =>
      row == null
        ? null
        : decimalText(Math.floor((row.minutes * 100 + 30) / 60), 2),
    ),
    usage,
    dayTotal,
    overCap: dayTotal > EQUIPMENT_SHEET_LIMITS.dayCentiHours,
    meterDelta: meter?.delta ?? null,
    gap:
      opening == null || machine.lastClosing == null
        ? null
        : meterGap(opening, lenient(machine.lastClosing.reading, READING)),
    fuelRate:
      fuel == null || used <= 0
        ? null
        : String(Math.round((fuel / used) * 100) / 100),
    overrun: fuelOverrun({
      fuelMilli: fuel,
      usageMilli: used,
      efficiencyMilli: efficiency,
    }),
    hire,
  };
}

/** Whether the form shows meter readings / time shifts for this machine. */
export function showsMeter(
  machine: SheetMachine,
  settings: EquipmentSheetSettings,
): boolean {
  return usesMeter(machine.workingTimeMethod, settings.showMeterReadings);
}

export function showsShifts(machine: SheetMachine): boolean {
  return usesShifts(machine.workingTimeMethod);
}

/** Hourly with the meter method but the meter hidden: hours are typed. */
export function typesHours(
  machine: SheetMachine,
  settings: EquipmentSheetSettings,
): boolean {
  return (
    machine.utilisationBasis === "hourly" &&
    machine.workingTimeMethod === "meter_reading" &&
    !settings.showMeterReadings
  );
}

/** Km without a meter reading: the distance is typed. */
export function typesDistance(
  machine: SheetMachine,
  settings: EquipmentSheetSettings,
): boolean {
  return (
    machine.utilisationBasis === "km" &&
    !(
      machine.workingTimeMethod === "meter_reading" &&
      settings.showMeterReadings
    )
  );
}

/**
 * The first refusal the server's content rules would give for the
 * figures typed (shifts, readings, hours, fuel, hire), with the form field
 * it is about; null when they pass. Masters (Contractor, supervisor,
 * materials) are the server's to check.
 */
export function figureError(
  values: LiveValues & { shift: string; fuelBorneBy: string },
  machine: SheetMachine,
  settings: EquipmentSheetSettings,
): { field: string; message: string } | null {
  if (values.sheetDate === "") return null;
  const tripsText = values.trips.trim();
  const terms = hireTerms(machine);
  const rate = values.unitRate.trim();
  try {
    equipmentSheetContent(
      {
        sheetDate: values.sheetDate,
        shift: values.shift === "" ? "shift_1" : values.shift,
        timeShifts: values.timeShifts,
        openingReading: values.openingReading,
        closingReading: values.closingReading,
        usageHours: values.usageHours,
        distanceKm: values.distanceKm,
        trips:
          tripsText === ""
            ? null
            : /^\d+$/.test(tripsText)
              ? Number(tripsText)
              : -1,
        idleHours: values.idleHours,
        breakdownHours: values.breakdownHours,
        fuelQty: values.fuelQty,
        fuelBorneBy: values.fuelBorneBy === "" ? null : values.fuelBorneBy,
        unitRate:
          terms == null || rate === ""
            ? null
            : /^\d{1,11}(\.\d{1,2})?$/.test(rate)
              ? Math.round(Number(rate) * 100)
              : -1,
        billableQty: terms == null ? null : values.billableQty,
      },
      settings,
      {
        equipment: {
          id: machine.id,
          ownership: machine.ownership,
          utilisationBasis: machine.utilisationBasis,
          workingTimeMethod: machine.workingTimeMethod,
          fuelUnit: machine.fuelUnit,
          expectedFuelEfficiency: machine.expectedFuelEfficiency,
          hire: terms,
        },
        financial: true,
        supervisor: null,
        contractor: null,
        department: null,
        unit: null,
        materials: new Map(),
      },
    );
    return null;
  } catch (error) {
    if (!(error instanceof DomainError)) return null;
    const details = (error.details ?? {}) as {
      field?: string;
      index?: number;
    };
    const field = details.field ?? "";
    if (field === "startTime" || field === "endTime")
      return {
        field: `timeShifts.${String(details.index ?? 0)}.${field}`,
        message: error.message,
      };
    if (error.code === "UNIT_RATE_INVALID")
      return { field: "unitRate", message: "Enter a rate in rupees." };
    return field === "" ? null : { field, message: error.message };
  }
}

/** `"8.50"` → `"8.5"`, `"10.00"` → `"10"`. */
export function trimDecimal(value: string): string {
  return value.includes(".") ? value.replace(/\.?0+$/, "") : value;
}

/** Hundredths as `"8.5"`. */
export function centiText(value: number): string {
  return trimDecimal(decimalText(value, 2));
}

/** All shifts valid and none overlapping (for the row hint). */
export function overlapIndex(
  rows: readonly { startTime: string; endTime: string }[],
): number | null {
  try {
    timeShifts(rows);
    return null;
  } catch (error) {
    if (error instanceof DomainError && error.code === "TIME_SHIFTS_OVERLAP")
      return (error.details as { index: number }).index;
    return null;
  }
}
