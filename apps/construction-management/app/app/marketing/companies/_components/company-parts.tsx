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
  LOST_REASON_LABELS,
  STAGE_LABELS,
  type LostReason,
  type Stage,
} from "@/src/marketing/domain/marketing-terms";
import type { ProspectCompanyTimelineItem } from "@/src/queries/marketing-companies";

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
export function stageEntryWords(item: ProspectCompanyTimelineItem): string {
  const stage = STAGE_LABELS[item.toStage];
  return item.fromStage == null ? `Added at ${stage}` : `Moved to ${stage}`;
}

/** "by Ravi · 12 Nov 2026, 4:05 pm" in the Company's time zone. */
export function stageEntryByline(
  item: ProspectCompanyTimelineItem,
  timeZone: string,
): string {
  return `by ${item.byName} · ${activityRecordedLabel(item.at, timeZone)}`;
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
