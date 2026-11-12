"use client";

import { MapPinCheck } from "lucide-react";
import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

import { activityRecordedLabel } from "@/app/app/_components/activity/activity-feed";
import {
  INTEREST_LABELS,
  VISIT_STATUS_LABELS,
  type Interest,
  type VisitShownStatus,
} from "@/src/marketing/domain/marketing-terms";
import { visitFileWord } from "@/src/queries/marketing-visit-files";
import type { VisitHistoryItem } from "@/src/queries/marketing-visits";
import { zoneInstant, zoneParts } from "@/src/shared-kernel/zone-time";

/** A status's colours, for its badge and the calendar's entries. */
export const STATUS_CLASSES: Record<VisitShownStatus, string> = {
  planned:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  missed:
    "border-red-400 bg-red-100 font-semibold text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
  completed:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  cancelled: "border-border bg-muted text-muted-foreground",
};

export function VisitStatusBadge({
  status,
  className,
}: {
  status: VisitShownStatus;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(STATUS_CLASSES[status], className)}>
      {VISIT_STATUS_LABELS[status]}
    </Badge>
  );
}

/** "Checked in" at the site; `compact` keeps the words for screen readers. */
export function CheckedInMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
      <MapPinCheck aria-hidden="true" className="size-3.5" />
      <span className={compact ? "sr-only" : undefined}>Checked in</span>
    </span>
  );
}

const INTEREST_CLASSES: Record<Interest, string> = {
  hot: "border-orange-300 bg-orange-50 text-orange-900 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-100",
  warm: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  cold: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100",
};

export function InterestBadge({ interest }: { interest: Interest | null }) {
  if (interest == null) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={INTEREST_CLASSES[interest]}>
      {INTEREST_LABELS[interest]}
    </Badge>
  );
}

/** "12 Nov 2026, 10:00 am" in the Company time zone. */
export function visitWhen(at: string, timeZone: string): string {
  return activityRecordedLabel(at, timeZone);
}

/** "10:00 am" in the Company time zone. */
export function visitTime(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

/** "12 Nov, 10:00 am": the same, without the year. */
export function shortWhen(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(at));
}

const pad = (n: number) => String(n).padStart(2, "0");

/** An instant as the zone's `YYYY-MM-DD` and `HH:MM`, for date and time inputs. */
export function zoneFields(
  at: Date,
  timeZone: string,
): { date: string; time: string } {
  const p = zoneParts(at, timeZone);
  return {
    date: `${String(p.year)}-${pad(p.month)}-${pad(p.day)}`,
    time: `${pad(p.hour)}:${pad(p.minute)}`,
  };
}

/** The instant (ISO) a date and `HH:MM` name on the zone's wall clock. */
export function zoneIso(date: string, time: string, timeZone: string): string {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return zoneInstant(date, hours * 60 + minutes, timeZone).toISOString();
}

/** "₹ 25,00,000" (Indian grouping) for whole rupees. */
export function wholeRupees(value: number): string {
  return `₹ ${new Intl.NumberFormat("en-IN").format(value)}`;
}

/** `2027-03` as "Mar 2027". */
export function monthWords(month: string): string {
  const [year = 0, number = 1] = month.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, number - 1, 1)));
}

/**
 * One History line: "Planned by Ravi", "Rescheduled from 12 Nov, 10:00 am
 * to 14 Nov, 11:30 am", "Cancelled · Client not available", "Photo added ·
 * card.jpg".
 */
export function historyWords(
  item: VisitHistoryItem,
  timeZone: string,
  plannedAtFirst: boolean,
): string {
  switch (item.action) {
    case "created":
      return plannedAtFirst ? "Planned" : "Logged";
    case "updated":
      return "Edited";
    case "completed":
      return "Completed";
    case "rescheduled":
      return item.from != null && item.to != null
        ? `Rescheduled from ${shortWhen(item.from, timeZone)} to ${shortWhen(item.to, timeZone)}`
        : "Rescheduled";
    case "cancelled":
      return item.reason == null ? "Cancelled" : `Cancelled · ${item.reason}`;
    case "note_added":
      return "Note added";
    case "file_added":
    case "file_removed": {
      const name = item.fileName ?? "a file";
      const done = item.action === "file_added" ? "added" : "removed";
      return `${visitFileWord(name)} ${done} · ${name}`;
    }
    case "checked_in":
      return "Checked in";
    case "checked_out":
      return "Checked out";
  }
}
