import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";

/**
 * The Equipment register (CM-603, ADR CM-0016 §10): what a machine is, how
 * its use is measured, and — for rented equipment — who it is hired from
 * and at what rate. Pure rules; no Prisma, no Zod.
 */

export const EQUIPMENT_OWNERSHIPS = ["owned", "rented"] as const;
export type EquipmentOwnership = (typeof EQUIPMENT_OWNERSHIPS)[number];

export const UTILISATION_BASES = ["hourly", "km", "trip"] as const;
export type UtilisationBasis = (typeof UTILISATION_BASES)[number];

export const WORKING_TIME_METHODS = [
  "time_shifts",
  "meter_reading",
  "both",
] as const;
export type WorkingTimeMethod = (typeof WORKING_TIME_METHODS)[number];

export const TARGET_UNITS = [
  "hours_per_day",
  "days_per_month",
  "km_per_day",
  "trips_per_day",
] as const;
export type TargetUnit = (typeof TARGET_UNITS)[number];

/** Fixed lists in code, not masters (CM-0016 §1). */
export const FUEL_TYPES = ["cng", "diesel", "petrol"] as const;
export type FuelType = (typeof FUEL_TYPES)[number];

export const FUEL_UNITS = ["barrel", "gallon", "kg", "litre", "unit"] as const;
export type FuelUnit = (typeof FUEL_UNITS)[number];

export const HIRE_BASES = ["hourly", "daily", "monthly", "trip"] as const;
export type HireBasis = (typeof HIRE_BASES)[number];

export const OWNERSHIP_LABELS: Record<EquipmentOwnership, string> = {
  owned: "Company owned",
  rented: "Rented",
};

export const UTILISATION_BASIS_LABELS: Record<UtilisationBasis, string> = {
  hourly: "Hourly",
  km: "Km",
  trip: "Trip",
};

export const WORKING_TIME_METHOD_LABELS: Record<WorkingTimeMethod, string> = {
  time_shifts: "Time Shifts",
  meter_reading: "Meter Reading",
  both: "Both",
};

export const TARGET_UNIT_LABELS: Record<TargetUnit, string> = {
  hours_per_day: "hrs/day",
  days_per_month: "days/month",
  km_per_day: "km/day",
  trips_per_day: "trips/day",
};

export const FUEL_TYPE_LABELS: Record<FuelType, string> = {
  cng: "CNG",
  diesel: "Diesel",
  petrol: "Petrol",
};

export const FUEL_UNIT_LABELS: Record<FuelUnit, string> = {
  barrel: "Barrel",
  gallon: "Gallon",
  kg: "Kg",
  litre: "Litre",
  unit: "Unit",
};

export const HIRE_BASIS_LABELS: Record<HireBasis, string> = {
  hourly: "Hourly",
  daily: "Daily",
  monthly: "Monthly",
  trip: "Trip",
};

/** The target units that fit each basis (CM-0016 §10). */
export const TARGET_UNITS_BY_BASIS: Record<
  UtilisationBasis,
  readonly TargetUnit[]
> = {
  hourly: ["hours_per_day", "days_per_month"],
  km: ["km_per_day"],
  trip: ["trips_per_day"],
};

/** The working time methods that fit each basis: Both only for Hourly. */
export function workingTimeMethodsFor(
  basis: UtilisationBasis,
): readonly WorkingTimeMethod[] {
  return basis === "hourly"
    ? WORKING_TIME_METHODS
    : ["time_shifts", "meter_reading"];
}

export const EQUIPMENT_LIMITS = {
  name: 120,
  number: 40,
  text: 120,
  contactNumber: 20,
  /** Purchase Year's earliest value; the latest is this year. */
  firstPurchaseYear: 1950,
  /** `hire_rate` is BIGINT paise; keep it far inside a JS safe integer. */
  maxHireRate: 100_000_000_000,
} as const;

/** What a save of the register takes, as sent (decimals as strings). */
export type EquipmentFieldsInput = {
  ownership: EquipmentOwnership;
  name: string;
  equipmentNumber: string;
  purchaseYear?: number | null;
  fuelType?: FuelType | null;
  fuelUnit?: FuelUnit | null;
  utilisationBasis: UtilisationBasis;
  workingTimeMethod: WorkingTimeMethod;
  targetValue?: string | null;
  targetUnit?: TargetUnit | null;
  minUtilisationPct?: string | null;
  expectedFuelEfficiency?: string | null;
  contactPersonName?: string | null;
  contactPersonNumber?: string | null;
  companyName?: string | null;
  hirePartyId?: string | null;
  hireBasis?: HireBasis | null;
  /** Paise per hire-basis unit. */
  hireRate?: number | null;
  idleChargeable?: boolean;
};

/** The register's own columns after the rules of §10. */
export type EquipmentFields = {
  ownership: EquipmentOwnership;
  name: string;
  equipmentNumber: string;
  purchaseYear: number | null;
  fuelType: FuelType | null;
  fuelUnit: FuelUnit | null;
  utilisationBasis: UtilisationBasis;
  workingTimeMethod: WorkingTimeMethod;
  /** Decimal strings at their column's scale. */
  targetValue: string | null;
  targetUnit: TargetUnit | null;
  minUtilisationPct: string | null;
  expectedFuelEfficiency: string | null;
  contactPersonName: string | null;
  contactPersonNumber: string | null;
  companyName: string | null;
  hirePartyId: string | null;
  hireBasis: HireBasis | null;
  hireRate: bigint | null;
  idleChargeable: boolean;
};

function invalid(code: string, message: string, field: string): DomainError {
  return new DomainError(code, message, { details: { field } });
}

function requiredName(
  raw: string,
  max: number,
  code: string,
  field: string,
  what: string,
): string {
  const text = raw.trim().replace(/\s+/g, " ");
  if (text === "") throw invalid(code, `Enter the ${what}.`, field);
  if (text.length > max)
    throw invalid(
      "TEXT_TOO_LONG",
      `Use at most ${String(max)} characters.`,
      field,
    );
  return text;
}

function optionalName(
  raw: string | null | undefined,
  max: number,
  field: string,
): string | null {
  const text = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (text.length > max)
    throw invalid(
      "TEXT_TOO_LONG",
      `Use at most ${String(max)} characters.`,
      field,
    );
  return text === "" ? null : text;
}

/**
 * A decimal string with at most `scale` decimals and `digits` whole digits,
 * written at the column's scale (`"8"` → `"8.00"`); null when empty.
 */
export function fixedDecimal(
  raw: string | null | undefined,
  options: { scale: number; digits: number },
  code: string,
  field: string,
  message: string,
): string | null {
  const text = raw?.trim() ?? "";
  if (text === "") return null;
  const match = new RegExp(
    `^(\\d{1,${String(options.digits)}})(?:\\.(\\d{1,${String(options.scale)}}))?$`,
  ).exec(text);
  if (match == null) throw invalid(code, message, field);
  const whole = String(Number(match[1]));
  const fraction = (match[2] ?? "").padEnd(options.scale, "0");
  return options.scale === 0 ? whole : `${whole}.${fraction}`;
}

function isZero(decimal: string): boolean {
  return /^0+(\.0+)?$/.test(decimal);
}

/**
 * Checks and tidies the register's fields (CM-0016 §10). `thisYear` is the
 * Company's calendar year. Every refusal is 400 with `details.field`.
 */
export function equipmentFields(
  input: EquipmentFieldsInput,
  thisYear: number,
): EquipmentFields {
  const rented = input.ownership === "rented";
  const name = requiredName(
    input.name,
    EQUIPMENT_LIMITS.name,
    "EQUIPMENT_NAME_REQUIRED",
    "name",
    "equipment name",
  );
  const equipmentNumber = requiredName(
    input.equipmentNumber,
    EQUIPMENT_LIMITS.number,
    "EQUIPMENT_NUMBER_REQUIRED",
    "equipmentNumber",
    "equipment number",
  );

  const purchaseYear = input.purchaseYear ?? null;
  if (purchaseYear != null) {
    if (rented)
      throw invalid(
        "PURCHASE_YEAR_OWNED_ONLY",
        "Purchase Year is for Company owned equipment.",
        "purchaseYear",
      );
    if (
      !Number.isInteger(purchaseYear) ||
      purchaseYear < EQUIPMENT_LIMITS.firstPurchaseYear ||
      purchaseYear > thisYear
    )
      throw invalid(
        "PURCHASE_YEAR_INVALID",
        `Enter a year from ${String(EQUIPMENT_LIMITS.firstPurchaseYear)} to ${String(thisYear)}.`,
        "purchaseYear",
      );
  }

  const basis = input.utilisationBasis;
  if (!workingTimeMethodsFor(basis).includes(input.workingTimeMethod))
    throw invalid(
      "WORKING_TIME_METHOD_INVALID",
      "Both is only for Hourly equipment. Choose Time Shifts or Meter Reading.",
      "workingTimeMethod",
    );

  const targetValue = fixedDecimal(
    input.targetValue,
    { scale: 2, digits: 8 },
    "TARGET_VALUE_INVALID",
    "targetValue",
    "Enter a target more than 0, with at most 2 decimals.",
  );
  if (targetValue != null && isZero(targetValue))
    throw invalid(
      "TARGET_VALUE_INVALID",
      "Enter a target more than 0, with at most 2 decimals.",
      "targetValue",
    );
  // A unit without a target says nothing; it is dropped.
  const targetUnit = targetValue == null ? null : (input.targetUnit ?? null);
  if (targetValue != null && targetUnit == null)
    throw invalid(
      "TARGET_UNIT_REQUIRED",
      "Choose the target's unit.",
      "targetUnit",
    );
  if (targetUnit != null && !TARGET_UNITS_BY_BASIS[basis].includes(targetUnit))
    throw invalid(
      "TARGET_UNIT_INVALID",
      `A ${UTILISATION_BASIS_LABELS[basis]} target is in ${TARGET_UNITS_BY_BASIS[
        basis
      ]
        .map((unit) => TARGET_UNIT_LABELS[unit])
        .join(" or ")}.`,
      "targetUnit",
    );

  const minUtilisationPct = fixedDecimal(
    input.minUtilisationPct,
    { scale: 2, digits: 3 },
    "MIN_UTILISATION_INVALID",
    "minUtilisationPct",
    "Enter a percentage from 0 to 100, with at most 2 decimals.",
  );
  if (minUtilisationPct != null && Number(minUtilisationPct) > 100)
    throw invalid(
      "MIN_UTILISATION_INVALID",
      "Enter a percentage from 0 to 100, with at most 2 decimals.",
      "minUtilisationPct",
    );

  const expectedFuelEfficiency = fixedDecimal(
    input.expectedFuelEfficiency,
    { scale: 3, digits: 7 },
    "FUEL_EFFICIENCY_INVALID",
    "expectedFuelEfficiency",
    "Enter a fuel efficiency more than 0, with at most 3 decimals.",
  );
  if (expectedFuelEfficiency != null && isZero(expectedFuelEfficiency))
    throw invalid(
      "FUEL_EFFICIENCY_INVALID",
      "Enter a fuel efficiency more than 0, with at most 3 decimals.",
      "expectedFuelEfficiency",
    );

  const contactPersonNumber = optionalName(
    input.contactPersonNumber,
    EQUIPMENT_LIMITS.contactNumber,
    "contactPersonNumber",
  );
  if (
    contactPersonNumber != null &&
    !/^\+?[\d\s-]{6,}$/.test(contactPersonNumber)
  )
    throw invalid(
      "CONTACT_NUMBER_INVALID",
      "Enter a phone number.",
      "contactPersonNumber",
    );

  const hirePartyId = input.hirePartyId ?? null;
  const hireBasis = input.hireBasis ?? null;
  const hireRate = input.hireRate ?? null;
  const idleChargeable = input.idleChargeable ?? false;
  if (rented) {
    if (hirePartyId == null)
      throw invalid(
        "HIRE_PARTY_REQUIRED",
        "Choose the Contractor it is hired from.",
        "hirePartyId",
      );
    if (hireBasis == null)
      throw invalid(
        "HIRE_BASIS_REQUIRED",
        "Choose the hire basis.",
        "hireBasis",
      );
    if (hireRate == null)
      throw invalid("HIRE_RATE_REQUIRED", "Enter the hire rate.", "hireRate");
    if (
      !Number.isSafeInteger(hireRate) ||
      hireRate < 0 ||
      hireRate > EQUIPMENT_LIMITS.maxHireRate
    )
      throw invalid(
        "HIRE_RATE_INVALID",
        "Enter a hire rate of 0 or more.",
        "hireRate",
      );
  } else {
    if (hirePartyId != null || hireBasis != null || hireRate != null)
      throw invalid(
        "HIRE_DETAILS_RENTED_ONLY",
        "Hire details are for rented equipment.",
        hirePartyId != null
          ? "hirePartyId"
          : hireBasis != null
            ? "hireBasis"
            : "hireRate",
      );
    if (idleChargeable)
      throw invalid(
        "IDLE_CHARGEABLE_RENTED_ONLY",
        "Chargeable idle time is for rented equipment.",
        "idleChargeable",
      );
  }

  return {
    ownership: input.ownership,
    name,
    equipmentNumber,
    purchaseYear,
    fuelType: input.fuelType ?? null,
    fuelUnit: input.fuelUnit ?? null,
    utilisationBasis: basis,
    workingTimeMethod: input.workingTimeMethod,
    targetValue,
    targetUnit,
    minUtilisationPct,
    expectedFuelEfficiency,
    contactPersonName: optionalName(
      input.contactPersonName,
      EQUIPMENT_LIMITS.text,
      "contactPersonName",
    ),
    contactPersonNumber,
    companyName: optionalName(
      input.companyName,
      EQUIPMENT_LIMITS.text,
      "companyName",
    ),
    hirePartyId: rented ? hirePartyId : null,
    hireBasis: rented ? hireBasis : null,
    hireRate: rented && hireRate != null ? BigInt(hireRate) : null,
    idleChargeable: rented ? idleChargeable : false,
  };
}

export function equipmentNumberTaken(equipmentNumber: string): DomainError {
  return conflict(
    "EQUIPMENT_NUMBER_TAKEN",
    `Equipment Number ${equipmentNumber} is already in the register.`,
    { field: "equipmentNumber" },
  );
}

// ---------------------------------------------------------------------------
// Where it is and whether it can take a sheet (CM-0016 §11)
// ---------------------------------------------------------------------------

/**
 * The register's state column: an open maintenance entry wins, then the
 * availability flag (CM-603 "Available / In maintenance / Unavailable").
 */
export const EQUIPMENT_STATES = [
  "available",
  "in_maintenance",
  "unavailable",
] as const;
export type EquipmentState = (typeof EQUIPMENT_STATES)[number];

export const EQUIPMENT_STATE_LABELS: Record<EquipmentState, string> = {
  available: "Available",
  in_maintenance: "In maintenance",
  unavailable: "Unavailable",
};

export function equipmentState(input: {
  inMaintenance: boolean;
  availableForEntry: boolean;
}): EquipmentState {
  if (input.inMaintenance) return "in_maintenance";
  return input.availableForEntry ? "available" : "unavailable";
}

/** Where the Warehouse / off system is called on screens and reports. */
export const WAREHOUSE_LABEL = "Warehouse / off system";

/** Today's availability toggle (CM-0016 §11 "Availability"). */
export function availabilityChange(
  available: boolean,
  today: CalendarDate,
): { availableForEntry: boolean; unavailableSince: CalendarDate | null } {
  return available
    ? { availableForEntry: true, unavailableSince: null }
    : { availableForEntry: false, unavailableSince: today };
}
