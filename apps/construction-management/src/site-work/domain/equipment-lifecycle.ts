import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import { DomainError, conflict } from "@/src/shared-kernel/domain-error";

import { EQUIPMENT_LIMITS } from "./equipment";

/**
 * The Equipment lifecycle (CM-605, ADR CM-0016 §11): movements between
 * Projects and the warehouse, maintenance entries, and whether a usage
 * sheet may be filled for a date. Pure rules; dates are calendar dates.
 */

export const EQUIPMENT_MOVEMENT_KINDS = [
  "added",
  "to_project",
  "to_warehouse",
] as const;
export type EquipmentMovementKind = (typeof EQUIPMENT_MOVEMENT_KINDS)[number];

export const MOVEMENT_KIND_LABELS: Record<EquipmentMovementKind, string> = {
  added: "Added",
  to_project: "Transfer to Project",
  to_warehouse: "Transfer to Warehouse",
};

export const MAINTENANCE_KINDS = [
  "breakdown",
  "service",
  "repair",
  "other",
] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];

export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = {
  breakdown: "Breakdown",
  service: "Service",
  repair: "Repair",
  other: "Other",
};

/** A movement as the sheet rule reads it. */
export type MovementFact = {
  movementDate: CalendarDate;
  /** Null = the warehouse / off system. */
  toProjectId: string | null;
  createdAt: Date;
};

/** A live maintenance entry as the sheet rule reads it. */
export type MaintenanceFact = {
  startDate: CalendarDate;
  /** Null while open. */
  endDate: CalendarDate | null;
};

export type EquipmentSheetBlocker =
  | "EQUIPMENT_NOT_ON_PROJECT"
  | "EQUIPMENT_IN_MAINTENANCE"
  | "EQUIPMENT_UNAVAILABLE";

/**
 * Where the equipment was at the end of `date`: the latest movement on or
 * before it (ties by `createdAt`). `undefined` before its first movement;
 * `null` at the warehouse.
 */
export function projectOn(
  date: CalendarDate,
  movements: readonly MovementFact[],
): string | null | undefined {
  let latest: MovementFact | undefined;
  for (const movement of movements) {
    if (movement.movementDate > date) continue;
    if (
      latest == null ||
      movement.movementDate > latest.movementDate ||
      (movement.movementDate === latest.movementDate &&
        movement.createdAt.getTime() > latest.createdAt.getTime())
    )
      latest = movement;
  }
  return latest?.toProjectId;
}

/** Whether a live maintenance entry covers `date` (start ≤ date ≤ end, or open). */
export function inMaintenanceOn(
  date: CalendarDate,
  maintenance: readonly MaintenanceFact[],
): boolean {
  return maintenance.some(
    (entry) =>
      entry.startDate <= date &&
      (entry.endDate == null || date <= entry.endDate),
  );
}

/**
 * Why an Equipment Usage sheet cannot be filled for this equipment at this
 * Project on `date`, or null when it can (CM-0016 §11). Checked in this
 * order: it was at this Project on that date, no maintenance entry covers
 * the date, and it is not marked unavailable now. The usage-sheet handlers
 * (CM-604) call it inside their transaction.
 */
export function equipmentSheetBlocker(input: {
  date: CalendarDate;
  projectId: string;
  availableForEntry: boolean;
  /** All of the equipment's movements. */
  movements: readonly MovementFact[];
  /** Live entries. */
  maintenance: readonly MaintenanceFact[];
}): null | EquipmentSheetBlocker {
  if (projectOn(input.date, input.movements) !== input.projectId)
    return "EQUIPMENT_NOT_ON_PROJECT";
  if (inMaintenanceOn(input.date, input.maintenance))
    return "EQUIPMENT_IN_MAINTENANCE";
  if (!input.availableForEntry) return "EQUIPMENT_UNAVAILABLE";
  return null;
}

const BLOCKER_MESSAGES: Record<EquipmentSheetBlocker, string> = {
  EQUIPMENT_NOT_ON_PROJECT:
    "This equipment was not at this Project on that date.",
  EQUIPMENT_IN_MAINTENANCE: "This equipment was in maintenance on that date.",
  EQUIPMENT_UNAVAILABLE:
    "This equipment is marked unavailable for worksheet entry.",
};

/** The blocker as a 409 the usage-sheet routes can throw. */
export function equipmentSheetBlocked(
  blocker: EquipmentSheetBlocker,
): DomainError {
  return conflict(blocker, BLOCKER_MESSAGES[blocker], { field: "equipmentId" });
}

// ---------------------------------------------------------------------------
// Transfers
// ---------------------------------------------------------------------------

function invalid(
  code: string,
  message: string,
  field: string,
  more: Record<string, unknown> = {},
): DomainError {
  return new DomainError(code, message, { details: { field, ...more } });
}

/** A location name: required, one line, ≤ 120. */
export function locationNameOf(raw: string | null | undefined): string {
  const text = raw?.trim().replace(/\s+/g, " ") ?? "";
  if (text === "")
    throw invalid(
      "LOCATION_NAME_REQUIRED",
      "Enter where it is kept.",
      "locationName",
    );
  if (text.length > EQUIPMENT_LIMITS.text)
    throw invalid(
      "TEXT_TOO_LONG",
      `Use at most ${String(EQUIPMENT_LIMITS.text)} characters.`,
      "locationName",
    );
  return text;
}

export type TransferCheck = {
  kind: "to_project" | "to_warehouse";
  movementDate: CalendarDate;
  today: CalendarDate;
  /** Where it is now; null at the warehouse. */
  currentProjectId: string | null;
  /** Required for `to_project`. */
  toProjectId: string | null;
  /** The date of its latest movement. */
  lastMovementDate: CalendarDate | null;
  /** The latest live usage sheet at the source Project, if any. */
  lastSheetDate: CalendarDate | null;
  inMaintenance: boolean;
};

/**
 * Transfer to Project / Transfer to Warehouse (CM-0016 §11): not while in
 * maintenance (409 `EQUIPMENT_IN_MAINTENANCE`); to the warehouse only from
 * a Project (409 `EQUIPMENT_AT_WAREHOUSE`); to a Project other than the
 * current one; dated no later than today, and no earlier than its last
 * movement, and after the last usage sheet at the source Project.
 */
export function assertTransfer(check: TransferCheck): void {
  if (check.inMaintenance)
    throw conflict(
      "EQUIPMENT_IN_MAINTENANCE",
      "Return it to service before moving it.",
    );
  if (check.kind === "to_warehouse" && check.currentProjectId == null)
    throw conflict(
      "EQUIPMENT_AT_WAREHOUSE",
      "It is already at the warehouse. Transfer it to a Project instead.",
    );
  if (check.kind === "to_project") {
    if (check.toProjectId == null)
      throw invalid(
        "TO_PROJECT_REQUIRED",
        "Choose the Project it goes to.",
        "toProjectId",
      );
    if (check.toProjectId === check.currentProjectId)
      throw invalid(
        "TRANSFER_SAME_PROJECT",
        "It is already at this Project. Choose another.",
        "toProjectId",
      );
  }
  if (check.movementDate > check.today)
    throw invalid(
      "TRANSFER_DATE_IN_FUTURE",
      "The transfer date cannot be after today.",
      "movementDate",
    );
  if (
    check.lastMovementDate != null &&
    check.movementDate < check.lastMovementDate
  )
    throw invalid(
      "TRANSFER_BEFORE_LAST_MOVEMENT",
      `It was last moved on ${check.lastMovementDate}. Choose that date or later.`,
      "movementDate",
      { lastMovementDate: check.lastMovementDate },
    );
  // A machine is at one Project on a date, so it leaves the day after its
  // last sheet there: a same-day move would orphan that sheet.
  if (check.lastSheetDate != null && check.movementDate <= check.lastSheetDate)
    throw invalid(
      "TRANSFER_BEFORE_LAST_SHEET",
      `It has a usage sheet at this Project on ${check.lastSheetDate}. Choose a later date.`,
      "movementDate",
      { lastSheetDate: check.lastSheetDate },
    );
}

/** The first placement: not after today. */
export function assertPlacedOn(
  placedOn: CalendarDate,
  today: CalendarDate,
): void {
  if (placedOn > today)
    throw invalid(
      "PLACED_ON_IN_FUTURE",
      "It cannot be placed after today.",
      "placedOn",
    );
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

export function maintenanceAlreadyOpen(): DomainError {
  return conflict(
    "MAINTENANCE_ALREADY_OPEN",
    "It is already in maintenance. Return it to service first.",
  );
}

export function maintenanceNotOpen(): DomainError {
  return conflict(
    "MAINTENANCE_NOT_OPEN",
    "This maintenance entry is already closed.",
  );
}

/** A maintenance start date: not after today. */
export function assertMaintenanceStart(
  startDate: CalendarDate,
  today: CalendarDate,
): void {
  if (startDate > today)
    throw invalid(
      "MAINTENANCE_DATE_IN_FUTURE",
      "The start date cannot be after today.",
      "startDate",
    );
}

/** Return to Service: on or after the start, not after today. */
export function assertMaintenanceEnd(
  startDate: CalendarDate,
  endDate: CalendarDate,
  today: CalendarDate,
): void {
  if (endDate > today)
    throw invalid(
      "MAINTENANCE_DATE_IN_FUTURE",
      "The return date cannot be after today.",
      "endDate",
    );
  if (endDate < startDate)
    throw invalid(
      "MAINTENANCE_END_BEFORE_START",
      `It went into maintenance on ${startDate}. Choose that date or later.`,
      "endDate",
    );
}

/** A maintenance cost in paise: a whole number ≥ 0, or null. */
export function maintenanceCost(raw: number | null | undefined): bigint | null {
  if (raw == null) return null;
  if (
    !Number.isSafeInteger(raw) ||
    raw < 0 ||
    raw > EQUIPMENT_LIMITS.maxHireRate
  )
    throw invalid(
      "MAINTENANCE_COST_INVALID",
      "Enter a cost of 0 or more.",
      "cost",
    );
  return BigInt(raw);
}
