import {
  daysBetween,
  type CalendarDate,
} from "@/src/shared-kernel/calendar-date";

import {
  column,
  totalsOf,
  type Cell,
  type ReportBody,
  type ReportColumn,
} from "./report-document";
import { dateLabel, type DateRange } from "./report-period";
import { MAINTENANCE_KIND_LABELS, WAREHOUSE_PLACE } from "./site-work-labels";

/** A live maintenance entry overlapping the period. */
export type ReportMaintenanceEntry = {
  equipment: string;
  equipmentNumber: string;
  kind: string;
  startDate: CalendarDate;
  /** Null while the equipment is still in maintenance. */
  endDate: CalendarDate | null;
  workshop: string | null;
  description: string | null;
  /** Paise. */
  cost: number | null;
  /** The Project the equipment was at when the entry started; null = warehouse or nowhere. */
  projectName: string | null;
};

/**
 * Days in maintenance, both ends counted; an open entry runs to `until` or
 * today, whichever is earlier (a period may end in the future).
 */
export function maintenanceDays(
  entry: Pick<ReportMaintenanceEntry, "startDate" | "endDate">,
  until: CalendarDate,
  today: CalendarDate = until,
): number {
  const end = entry.endDate ?? (today < until ? today : until);
  return end < entry.startDate ? 0 : daysBetween(entry.startDate, end) + 1;
}

/**
 * Equipment Maintenance (CM-605): the maintenance entries that overlap the
 * period (started on or before its end, not ended before its start), with
 * days in maintenance and, with Financial on Equipments, the cost. The
 * central report (Masters → Equipments) names the Project each machine was
 * at when the entry started.
 */
export function buildEquipmentMaintenanceReport(input: {
  range: DateRange;
  entries: readonly ReportMaintenanceEntry[];
  financial: boolean;
  /** The Company's today: an open entry is not counted past it. */
  today: CalendarDate;
  central: boolean;
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Equipment", "text", 18),
    column("Equipment No.", "text", 12),
  ];
  if (input.central) columns.push(column("Project", "text", 16));
  columns.push(
    column("Kind", "text", 9),
    column("Start", "text", 11),
    column("End", "text", 13),
    column("Days", "count", 6),
    column("Workshop", "text", 16),
    column("Description", "text", 26),
  );
  if (input.financial) columns.push(column("Cost", "money"));

  const entries = [...input.entries].sort(
    (a, b) =>
      a.startDate.localeCompare(b.startDate) ||
      a.equipment.localeCompare(b.equipment) ||
      a.equipmentNumber.localeCompare(b.equipmentNumber),
  );
  const rows: Cell[][] = entries.map((entry) => {
    const row: Cell[] = [entry.equipment, entry.equipmentNumber];
    if (input.central) row.push(entry.projectName ?? WAREHOUSE_PLACE);
    row.push(
      MAINTENANCE_KIND_LABELS[entry.kind] ?? entry.kind,
      dateLabel(entry.startDate),
      entry.endDate == null ? "In maintenance" : dateLabel(entry.endDate),
      maintenanceDays(entry, input.range.to, input.today),
      entry.workshop,
      entry.description,
    );
    if (input.financial) row.push(entry.cost);
    return row;
  });
  return {
    title: "Equipment Maintenance Report",
    notes: [
      input.central
        ? "Every machine of the Company, at any Project or the warehouse."
        : "Machines that were at this Project when their maintenance started.",
      "Entries that overlap the period; days count both ends, and an entry still open counts to the end of the period.",
      ...(input.financial
        ? []
        : ["Costs are left out: they need Financial on Equipments."]),
    ],
    tables: [
      {
        name: "Maintenance",
        columns,
        rows,
        totals: totalsOf(columns, rows, { 0: "Total" }),
      },
    ],
  };
}

/** Where equipment was before a transfer: a Project (or the warehouse) and the location name there. */
export type ReportPlace = {
  projectName: string | null;
  locationName: string | null;
};

/** A transfer (`to_project` or `to_warehouse` movement) in the period. */
export type ReportTransfer = {
  equipment: string;
  equipmentNumber: string;
  purchaseYear: number | null;
  date: CalendarDate;
  /** The place it left; null when no earlier movement is recorded. */
  before: ReportPlace | null;
  /** Null for a transfer to the warehouse. */
  toProject: string | null;
  /** The location name recorded with the transfer. */
  locationName: string;
  remark: string | null;
  entryBy: string | null;
};

function placeText(place: ReportPlace | null): string | null {
  if (place == null) return null;
  const parts = [place.projectName ?? WAREHOUSE_PLACE, place.locationName];
  return [...new Set(parts)]
    .filter((part) => part != null && part !== "")
    .join(" · ");
}

/**
 * Equipment Transfers (CM-605, the Transfer Report of `modules/04`): each
 * transfer to a Project or the warehouse in the period. From a Project it
 * lists transfers out of or into that Project.
 */
export function buildEquipmentTransferReport(input: {
  transfers: readonly ReportTransfer[];
  central: boolean;
}): ReportBody {
  const columns: ReportColumn[] = [
    column("Equipment Name", "text", 18),
    column("Number", "text", 12),
    column("Purchase Year", "text", 8),
    column("Transfer Date", "text", 11),
    column("Location Before", "text", 20),
    column("Transfer To Project", "text", 18),
    column("Latest Location", "text", 18),
    column("Remarks", "text", 20),
    column("Entry By", "text", 14),
  ];
  const transfers = [...input.transfers].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.equipment.localeCompare(b.equipment) ||
      a.equipmentNumber.localeCompare(b.equipmentNumber),
  );
  const rows: Cell[][] = transfers.map((transfer) => [
    transfer.equipment,
    transfer.equipmentNumber,
    transfer.purchaseYear == null ? null : String(transfer.purchaseYear),
    dateLabel(transfer.date),
    placeText(transfer.before),
    transfer.toProject ?? WAREHOUSE_PLACE,
    transfer.locationName,
    transfer.remark,
    transfer.entryBy,
  ]);
  return {
    title: "Equipment Transfer Report",
    notes: [
      input.central
        ? "Every transfer of the Company's equipment in the period."
        : "Transfers out of or into this Project in the period.",
      "Latest Location is the location name recorded with the transfer.",
    ],
    tables: [{ name: "Transfers", columns, rows, totals: null }],
  };
}
