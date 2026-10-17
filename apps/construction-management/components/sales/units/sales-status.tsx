import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

import {
  BOOKING_DISPLAY_STATUS_LABELS,
  type BookingDisplayStatus,
} from "@/src/sales/domain/booking";
import {
  AREA_UNIT_LABELS,
  UNIT_SALES_STATUS_LABELS,
  type AreaUnit,
  type UnitSalesStatus,
} from "@/src/sales/domain/sales-terms";

/**
 * The colours of a unit's sales status (CM-0022 §8) on the Units chart,
 * its legend and badges: Available green, On Hold amber, Booked blue,
 * Unavailable grey. Each cell also carries the status as words, so colour
 * is never the only signal.
 */
export const UNIT_STATUS_CLASSES: Record<UnitSalesStatus, string> = {
  available:
    "border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  on_hold:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  booked:
    "border-sky-300 bg-sky-100 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  unavailable: "border-border bg-muted text-muted-foreground",
};

/** A dot in the status colour, for legends and counts. */
export const UNIT_STATUS_DOTS: Record<UnitSalesStatus, string> = {
  available: "bg-emerald-500",
  on_hold: "bg-amber-500",
  booked: "bg-sky-600",
  unavailable: "bg-zinc-400",
};

export function UnitStatusBadge({
  status,
  className,
}: {
  status: UnitSalesStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(UNIT_STATUS_CLASSES[status], className)}
    >
      {UNIT_SALES_STATUS_LABELS[status]}
    </Badge>
  );
}

const BOOKING_CLASSES: Record<BookingDisplayStatus, string> = {
  on_hold: UNIT_STATUS_CLASSES.on_hold,
  hold_expired:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  booked: UNIT_STATUS_CLASSES.booked,
  cancelled: UNIT_STATUS_CLASSES.unavailable,
};

/** On Hold / Hold expired / Booked / Cancelled, with its colour. */
export function BookingStatusBadge({
  status,
}: {
  status: BookingDisplayStatus;
}) {
  return (
    <Badge variant="outline" className={BOOKING_CLASSES[status]}>
      {BOOKING_DISPLAY_STATUS_LABELS[status]}
    </Badge>
  );
}

/** "1,050.5 sq ft", or null without an area. */
export function areaLabel(area: string | null, unit: AreaUnit): string | null {
  if (area == null) return null;
  const [whole = "0", decimals] = area.split(".");
  const grouped = Number(whole).toLocaleString("en-IN");
  return `${decimals == null ? grouped : `${grouped}.${decimals}`} ${AREA_UNIT_LABELS[unit]}`;
}
