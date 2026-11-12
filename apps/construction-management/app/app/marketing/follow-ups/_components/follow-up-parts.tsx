"use client";

import {
  CircleDot,
  FileText,
  Mail,
  MapPinned,
  Phone,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

import {
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_TYPE_LABELS,
  type FollowUpDue,
  type FollowUpStatus,
  type FollowUpType,
} from "@/src/marketing/domain/marketing-terms";

const TYPE_ICONS: Record<FollowUpType, LucideIcon> = {
  call: Phone,
  visit: MapPinned,
  email: Mail,
  send_quotation: FileText,
  other: CircleDot,
};

export function FollowUpTypeBadge({ type }: { type: FollowUpType }) {
  const Icon = TYPE_ICONS[type];
  return (
    <Badge variant="outline" className="gap-1">
      <Icon aria-hidden="true" />
      {FOLLOW_UP_TYPE_LABELS[type]}
    </Badge>
  );
}

const DUE_LABELS: Record<FollowUpDue, string> = {
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Upcoming",
};

const BADGE_CLASSES: Record<FollowUpDue | "done" | "cancelled", string> = {
  overdue:
    "border-red-400 bg-red-100 font-semibold text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100",
  today:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  upcoming:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  done: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  cancelled: "border-border bg-muted text-muted-foreground",
};

/** Overdue, Due today or Upcoming while Open; Done or Cancelled after. */
export function FollowUpStatusBadge({
  status,
  due,
}: {
  status: FollowUpStatus;
  due: FollowUpDue | null;
}) {
  const key = status === "open" ? (due ?? "upcoming") : status;
  return (
    <Badge variant="outline" className={cn(BADGE_CLASSES[key])}>
      {status === "open"
        ? DUE_LABELS[due ?? "upcoming"]
        : FOLLOW_UP_STATUS_LABELS[status]}
    </Badge>
  );
}

function calendar(date: string): Date {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** `2026-11-14` as "14 Nov 2026". */
export function dayWords(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(calendar(date));
}

/** `2026-11-14` as "14 Nov". */
export function shortDayWords(date: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(calendar(date));
}
