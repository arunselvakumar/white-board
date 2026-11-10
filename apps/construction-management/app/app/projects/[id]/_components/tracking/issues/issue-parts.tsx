import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

import {
  ISSUE_STATUS_LABELS,
  type IssueStatus,
} from "@/src/tracking/domain/issue";
import {
  TRACKING_PRIORITIES,
  type TrackingPriority,
} from "@/src/tracking/domain/tracking-documents";

const STATUS_CLASSES: Record<IssueStatus, string> = {
  pending:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  delayed:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
  solved:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  closed: "border-border bg-muted text-muted-foreground",
};

/** Pending / Delayed / Solved / Closed: a word, with its colour. */
export function IssueStatusBadge({ status }: { status: IssueStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASSES[status]}>
      {ISSUE_STATUS_LABELS[status]}
    </Badge>
  );
}

/**
 * The priority as a filled chip with its label (CM-0019 §7): High
 * `#F90B0B`, Medium `#FF9900`, Low `#FCF200`. Black text reads on all
 * three (5:1 on the red, far more on the orange and the yellow); white
 * would fail on the red and the yellow.
 */
export function PriorityChip({
  priority,
  className,
}: {
  priority: TrackingPriority;
  className?: string;
}) {
  const item = TRACKING_PRIORITIES.find((entry) => entry.key === priority);
  if (item == null) return null;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap text-black",
        className,
      )}
      style={{ backgroundColor: item.color }}
    >
      {item.label}
    </span>
  );
}

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** `2026-10-14T06:30:00Z` → "14 Oct 2026, 12:00 pm" in the viewer's zone. */
export function formatDateTime(iso: string): string {
  return DATE_TIME.format(new Date(iso));
}
