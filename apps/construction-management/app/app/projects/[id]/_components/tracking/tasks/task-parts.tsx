import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";
import type { ReactNode } from "react";

import { formatPaise } from "@/components/money/money-input";
import { formatDate } from "@/components/payments/payment-format";
import type { Task } from "@/src/queries/tracking-tasks";
import {
  TASK_STATUS_LABELS,
  type TaskStatus,
} from "@/src/tracking/domain/task-progress";
import {
  TRACKING_PRIORITIES,
  type TrackingPriority,
} from "@/src/tracking/domain/tracking-documents";

/**
 * Small pieces the task screens share (CM-802): status and priority chips
 * (a colour **and** a label), the progress bar and value formatting.
 */

/** Status colours, used by the chip, the Gantt bars and its legend. */
export const STATUS_STYLES: Record<
  TaskStatus,
  { chip: string; bar: string; swatch: string }
> = {
  not_started: {
    chip: "border-slate-300 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
    bar: "fill-slate-400 dark:fill-slate-500",
    swatch: "bg-slate-400 dark:bg-slate-500",
  },
  in_progress: {
    chip: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
    bar: "fill-sky-500",
    swatch: "bg-sky-500",
  },
  delayed: {
    chip: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
    bar: "fill-red-500",
    swatch: "bg-red-500",
  },
  completed: {
    chip: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    bar: "fill-emerald-500",
    swatch: "bg-emerald-500",
  },
};

export function TaskStatusBadge({
  status,
  className,
}: {
  status: TaskStatus;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(STATUS_STYLES[status].chip, className)}
    >
      {TASK_STATUS_LABELS[status]}
    </Badge>
  );
}

/** Priority as a colour dot and its label (CM-0019 §5); never colour alone. */
export function PriorityChip({ priority }: { priority: TrackingPriority }) {
  const item = TRACKING_PRIORITIES.find((p) => p.key === priority);
  if (item == null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium">
      <span
        aria-hidden="true"
        className="size-2.5 shrink-0 rounded-full ring-1 ring-black/20"
        style={{ backgroundColor: item.color }}
      />
      {item.label}
    </span>
  );
}

export const PRIORITY_LABELS: Record<TrackingPriority, string> =
  Object.fromEntries(
    TRACKING_PRIORITIES.map((item) => [item.key, item.label]),
  ) as Record<TrackingPriority, string>;

/** A thin progress bar with the percentage beside it. */
export function TaskProgressBar({
  value,
  label,
  className,
}: {
  value: number;
  label: string;
  className?: string;
}) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        className="bg-muted h-1.5 min-w-12 flex-1 overflow-hidden rounded-full"
      >
        <div
          className="bg-primary h-full rounded-full"
          style={{ width: `${String(width)}%` }}
        />
      </div>
      <span className="text-muted-foreground w-16 shrink-0 text-right text-xs whitespace-nowrap tabular-nums">
        {formatPercent(value)}
      </span>
    </div>
  );
}

/** `42.5` → "42.5 %"; whole numbers without decimals. */
export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0$/, "")} %`;
}

/** "2 Sep – 9 Sep 2026", one date, or "No dates". */
export function dateRange(start: string | null, end: string | null): string {
  if (start == null && end == null) return "No dates";
  if (start == null) return `Due ${formatDate(end ?? "")}`;
  if (end == null) return `From ${formatDate(start)}`;
  if (start === end) return formatDate(start);
  return `${formatDate(start)} – ${formatDate(end)}`;
}

/** Days: "10 days", "1 day". */
export function days(value: number | null): string {
  if (value == null) return "—";
  return `${String(value)} ${Math.abs(value) === 1 ? "day" : "days"}`;
}

/** Variance in plain words: "3 days late", "2 days early", "On time". */
export function varianceText(value: number | null): string {
  if (value == null) return "—";
  if (value === 0) return "On time";
  return value > 0 ? `${days(value)} late` : `${days(-value)} early`;
}

/** Paise, or a dash when hidden or unpriced. */
export function price(paise: number | null): string {
  return paise == null ? "—" : formatPaise(paise);
}

/** "48 Cum" or "48". */
export function quantity(value: string | null, unit: Task["unit"]): string {
  if (value == null) return "—";
  return unit?.name == null ? value : `${value} ${unit.name}`;
}

/** A label and a value in a facts grid. */
export function Fact({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="text-sm break-words">{children}</dd>
    </div>
  );
}

/** "Prabhu, Karthik +2" for a list of assignees. */
export function assigneeNames(assignees: Task["assignees"]): string {
  if (assignees.length === 0) return "Unassigned";
  const names = assignees.map((a) => a.name ?? "A former member");
  return names.length <= 2
    ? names.join(", ")
    : `${names.slice(0, 2).join(", ")} +${String(names.length - 2)}`;
}
