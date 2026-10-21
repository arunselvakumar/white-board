import { Badge } from "@repo/ui/components/badge";
import { cn } from "@repo/ui/lib/utils";

import { formatDate } from "@/components/payments/payment-format";
import type { InquiryDetail } from "@/src/queries/sales-inquiries";
import {
  FOLLOW_UP_DUE_LABELS,
  INQUIRY_STATUS_LABELS,
  INTEREST_TYPE_LABELS,
  type FollowUpDue,
  type InquiryStatus,
  type InterestType,
} from "@/src/sales/domain/sales-terms";

const STATUS_CLASSES: Record<InquiryStatus, string> = {
  open: "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  converted:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  lost: "border-border bg-muted text-muted-foreground",
};

/** Open / Converted / Lost: a word, with its colour. */
export function InquiryStatusBadge({ status }: { status: InquiryStatus }) {
  return (
    <Badge variant="outline" className={STATUS_CLASSES[status]}>
      {INQUIRY_STATUS_LABELS[status]}
    </Badge>
  );
}

const INTEREST_CLASSES: Record<InterestType, string> = {
  hot: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-100",
  warm: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  cold: "bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-100",
};

/** Hot / Warm / Cold as a small chip. */
export function InterestChip({
  interest,
  className,
}: {
  interest: InterestType;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        INTEREST_CLASSES[interest],
        className,
      )}
    >
      {INTEREST_TYPE_LABELS[interest]}
    </span>
  );
}

const DUE_CLASSES: Record<FollowUpDue, string> = {
  overdue: "text-red-700 dark:text-red-300 font-medium",
  today: "text-amber-700 dark:text-amber-300 font-medium",
  upcoming: "text-muted-foreground",
  none: "text-muted-foreground",
};

/** "Today 10:30", "18 Oct 2026" or "No follow-up" for a next follow-up. */
export function followUpWords(
  next: { date: string; time: string | null } | null,
  today: string,
): string {
  if (next == null) return FOLLOW_UP_DUE_LABELS.none;
  const day = next.date === today ? "Today" : formatDate(next.date);
  return next.time == null ? day : `${day} ${next.time}`;
}

/** The next follow-up, coloured by Due (Overdue red, Today amber). */
export function NextFollowUp({
  next,
  due,
  today,
  className,
}: {
  next: { date: string; time: string | null } | null;
  due: FollowUpDue | null;
  today: string;
  className?: string;
}) {
  if (due == null)
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  return (
    <span className={cn(DUE_CLASSES[due], className)}>
      {due === "overdue" ? "Overdue · " : ""}
      {followUpWords(next, today)}
    </span>
  );
}

/** "+91 98450 12345" for a stored `+91…` number; others as stored. */
export { formatMobile } from "@repo/auth/construction/mobile";

/** "A Wing · 2BHK", "2BHK", "A Wing" or null. */
export function interestedIn(inquiry: {
  interestedWing: { name: string | null } | null;
  interestedUnitType: string | null;
}): string | null {
  const parts = [
    inquiry.interestedWing == null
      ? null
      : (inquiry.interestedWing.name ?? "A removed Wing"),
    inquiry.interestedUnitType,
  ].filter((part): part is string => part != null && part !== "");
  return parts.length === 0 ? null : parts.join(" · ");
}

/** One line of an inquiry's history (CM-0022 §3). */
export function inquiryHistoryLine(
  item: InquiryDetail["history"][number],
): string {
  const name = (key: string, fallback: string) =>
    item.names[key] ?? (item.details?.[key] == null ? null : fallback);
  switch (item.type) {
    case "created": {
      const stage = name("stageId", "a deleted stage");
      return stage == null ? "Added" : `Added at ${stage}`;
    }
    case "assigned": {
      const to = name("toMemberId", "a former member");
      return to == null ? "Assignee removed" : `Assigned to ${to}`;
    }
    case "lead_owner_changed": {
      const to = name("toMemberId", "a former member");
      return to == null ? "Lead Owner removed" : `Lead Owner now ${to}`;
    }
    case "stage_moved": {
      const from = name("fromStageId", "a deleted stage") ?? "no stage";
      const to = name("toStageId", "a deleted stage") ?? "no stage";
      return `Moved from ${from} to ${to}`;
    }
    case "converted": {
      const unit = name("unitId", "a removed unit");
      return unit == null
        ? "Closed as Converted"
        : `Closed as Converted: ${unit} booked`;
    }
    case "lost": {
      const reason = name("lostReasonId", "a deleted reason");
      return reason == null ? "Closed as Lost" : `Closed as Lost: ${reason}`;
    }
    case "reopened":
      return "Reopened";
  }
}
