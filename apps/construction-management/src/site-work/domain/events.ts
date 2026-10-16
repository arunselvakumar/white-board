import type { CalendarDate } from "@/src/shared-kernel/calendar-date";
import type { DomainEvent } from "@/src/shared-kernel/events";

/**
 * Site-work events (ADR CM-0016 §12). Raised after commit through an
 * in-process dispatcher; nothing listens yet — M7's payables take
 * `EquipmentHireAccrued` and M9's notifications `EquipmentFuelOverrun`.
 */

/**
 * A rented machine's hire accrued on a usage sheet: raised each time a
 * rented sheet is saved with approval off, saved with Save & Approve, or
 * approved. A listener keeps one accrual per `sheetId` (the latest wins).
 */
export type EquipmentHireAccrued = DomainEvent & {
  type: "EquipmentHireAccrued";
  sheetId: string;
  equipmentId: string;
  projectId: string;
  /** The Contractor the equipment is hired from. */
  hirePartyId: string | null;
  date: CalendarDate;
  /** Paise. */
  hireCost: bigint;
};

/**
 * An earlier `EquipmentHireAccrued` no longer stands: the sheet was deleted,
 * or edited back to pending. A listener drops its accrual for `sheetId`.
 */
export type EquipmentHireAccrualVoided = DomainEvent & {
  type: "EquipmentHireAccrualVoided";
  sheetId: string;
  equipmentId: string;
  projectId: string;
};

/** A usage sheet's fuel ÷ usage went above the Expected Fuel Efficiency. */
export type EquipmentFuelOverrun = DomainEvent & {
  type: "EquipmentFuelOverrun";
  sheetId: string;
  equipmentId: string;
  projectId: string;
  date: CalendarDate;
  /** Decimal strings: fuel in the equipment's fuel unit, efficiency per hour, km or trip. */
  fuelQty: string;
  expectedFuelEfficiency: string;
  /** The sheet's number as the screens show it (CM-904). */
  number?: string | null;
  /** User id of who saved the sheet; never notified of it (CM-904). */
  by?: string;
};

export type SiteWorkEvent =
  EquipmentHireAccrued | EquipmentHireAccrualVoided | EquipmentFuelOverrun;
