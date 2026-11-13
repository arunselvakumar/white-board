"use client";

import { Badge } from "@repo/ui/components/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { cn } from "@repo/ui/lib/utils";

import { activityRecordedLabel } from "@/app/app/_components/activity/activity-feed";
import {
  FOLLOW_UP_TYPE_LABELS,
  LOST_REASON_LABELS,
  STAGE_LABELS,
  VISIT_PURPOSE_LABELS,
  VISIT_STATUS_LABELS,
  type LostReason,
  type Stage,
} from "@/src/marketing/domain/marketing-terms";
import type { ProspectCompanyTimelineItem } from "@/src/queries/marketing-companies";

type TimelineEntry<K extends ProspectCompanyTimelineItem["kind"]> = Extract<
  ProspectCompanyTimelineItem,
  { kind: K }
>;

const STAGE_CLASSES: Record<Stage, string> = {
  new: "border-border bg-muted text-foreground",
  contacted:
    "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-100",
  requirement_received:
    "border-indigo-300 bg-indigo-50 text-indigo-900 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-100",
  quotation_sent:
    "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-100",
  negotiation:
    "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100",
  won: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-100",
  lost: "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-100",
};

export function StageBadge({
  stage,
  className,
}: {
  stage: Stage;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn(STAGE_CLASSES[stage], className)}>
      {STAGE_LABELS[stage]}
    </Badge>
  );
}

/** "Price", or "Other · Budget moved to next year". */
export function lostReasonWords(
  reason: LostReason | null,
  text: string | null,
): string | null {
  if (reason == null) return null;
  const label = LOST_REASON_LABELS[reason];
  return reason === "other" && text != null ? `${label} · ${text}` : label;
}

/** "Added at New" for the first entry, "Moved to Quotation sent" after. */
export function stageEntryWords(item: TimelineEntry<"stage">): string {
  const stage = STAGE_LABELS[item.toStage];
  return item.fromStage == null ? `Added at ${stage}` : `Moved to ${stage}`;
}

/** "by Ravi · 12 Nov 2026, 4:05 pm" in the Company's time zone. */
export function stageEntryByline(
  item: TimelineEntry<"stage" | "note" | "file">,
  timeZone: string,
): string {
  return `by ${item.byName} · ${activityRecordedLabel(item.at, timeZone)}`;
}

/** "MV-0003 · Completed · Requirement discussion · by Ravi, Priya". */
export function visitEntryWords(item: TimelineEntry<"visit">): string {
  return [
    item.number,
    VISIT_STATUS_LABELS[item.status],
    item.purpose == null ? null : VISIT_PURPOSE_LABELS[item.purpose],
    item.visitorNames.length === 0
      ? null
      : `by ${item.visitorNames.join(", ")}`,
  ]
    .filter((part): part is string => part != null)
    .join(" · ");
}

/** `2026-11-14` as "14 Nov". */
function shortDay(date: string): string {
  const [year = 1970, month = 1, day = 1] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * "Call due 14 Nov · Ravi Shankar — Done: sent the rates", "… —
 * Cancelled", or no ending while it is Open.
 */
export function followUpEntryWords(item: TimelineEntry<"follow_up">): string {
  const head = `${FOLLOW_UP_TYPE_LABELS[item.type]} due ${shortDay(item.dueDate)} · ${item.ownerName}`;
  if (item.status === "done")
    return `${head} — Done${item.resultNote == null ? "" : `: ${item.resultNote}`}`;
  if (item.status === "cancelled") return `${head} — Cancelled`;
  return head;
}

const NONE = "__none";

export type CompanyOption = { value: string; label: string };

/** A Select with an optional "none" first item; `""` is none. */
export function CompanySelect({
  id,
  value,
  onChange,
  items,
  noneLabel,
  placeholder = "Choose…",
  invalid,
  required = false,
  disabled,
  describedBy,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  items: readonly CompanyOption[];
  /** The first item; omit for a required pick. */
  noneLabel?: string;
  placeholder?: string;
  invalid?: boolean;
  required?: boolean;
  disabled?: boolean;
  /** The id of the field's error, when it shows one. */
  describedBy?: string;
}) {
  const all: CompanyOption[] =
    noneLabel == null
      ? [...items]
      : [{ value: NONE, label: noneLabel }, ...items];
  return (
    <Select
      items={all}
      value={value === "" ? (noneLabel == null ? null : NONE) : value}
      disabled={disabled}
      onValueChange={(next) => {
        if (next == null) return;
        onChange(next === NONE ? "" : next);
      }}
    >
      <SelectTrigger
        id={id}
        className="w-full min-w-0"
        aria-invalid={invalid}
        aria-required={required}
        aria-describedby={describedBy}
      >
        <SelectValue placeholder={noneLabel ?? placeholder} />
      </SelectTrigger>
      <SelectContent align="start" alignItemWithTrigger={false}>
        {all.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
