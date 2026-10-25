import type { ReactNode } from "react";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";
import { cn } from "@repo/ui/lib/utils";

/*
 * Pieces Finance's list screens share while they load (ADR-0047): a filter
 * bar with its real labels, figure tiles with their real labels, and a list
 * that is a table on wider screens and cards on a phone.
 */

const WIDTHS = ["62%", "48%", "70%", "55%", "66%"];

/**
 * A filter bar: each filter's real label over a control-sized bar.
 * `size="sm"` mirrors the small `FilterSelect` (text-xs label, h-8,
 * sm:w-44); the default the `Label` + h-9 sm:w-48 selects.
 */
export function FilterBarSkeleton({
  filters,
  size = "default",
  className = "grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end",
}: {
  filters: ReactNode[];
  size?: "sm" | "default";
  className?: string;
}) {
  return (
    <div className={className}>
      {filters.map((label, index) => (
        <div
          key={index}
          className={cn(
            "min-w-0",
            size === "sm" ? "space-y-1" : "space-y-1.5 sm:w-48",
          )}
        >
          <span
            className={cn(
              "block leading-none font-medium",
              size === "sm" ? "text-xs" : "text-sm",
            )}
          >
            {label}
          </span>
          <Skeleton
            className={cn(
              "w-full rounded-md",
              size === "sm" ? "h-8 sm:w-44" : "h-9",
            )}
          />
        </div>
      ))}
    </div>
  );
}

/** Figure tiles (`bg-card rounded-lg border p-3`): real labels, bars for the figures. */
export function SummaryTilesSkeleton({
  labels,
  className = "grid grid-cols-2 gap-3 sm:grid-cols-4",
}: {
  labels: ReactNode[];
  className?: string;
}) {
  return (
    <dl className={className}>
      {labels.map((label, index) => (
        <div key={index} className="bg-card min-w-0 rounded-lg border p-3">
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd>
            <SkeletonText size="base" width="7rem" className="max-w-full" />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** A select or picker whose options are loading: the control's own height. */
export function SelectControlSkeleton({
  label = "Loading options",
  className = "h-10 w-full",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <SkeletonGroup label={label}>
      <Skeleton className={cn("rounded-md", className)} />
    </SkeletonGroup>
  );
}

/** A phone's list of row cards (`bg-card rounded-lg border p-3`). */
export function RowCardsSkeleton({
  rows = 3,
  lines = 2,
  trailing = true,
  className = "space-y-2 md:hidden",
}: {
  rows?: number;
  lines?: number;
  /** An amount or badge at the card's top right. */
  trailing?: boolean;
  className?: string;
}) {
  return (
    <ul className={className}>
      {Array.from({ length: rows }, (_, row) => (
        <li key={row} className="bg-card rounded-lg border p-3">
          <div className="flex items-start justify-between gap-3">
            <SkeletonText width={WIDTHS[row % WIDTHS.length]} />
            {trailing ? <SkeletonText width="4.5rem" /> : null}
          </div>
          {Array.from({ length: lines }, (_, line) => (
            <SkeletonText
              key={line}
              size="xs"
              width={WIDTHS[(row + line + 2) % WIDTHS.length]}
            />
          ))}
        </li>
      ))}
    </ul>
  );
}

/**
 * A list that is a bordered table on wider screens (`hidden md:block`) and
 * row cards on a phone, with the "N entries" line above when `count`.
 */
export function ResponsiveListSkeleton({
  columns,
  rows = 5,
  count = false,
  cardLines = 2,
  label = "Loading",
  breakpoint = "md",
  className = "space-y-3",
}: {
  columns: SkeletonColumn[];
  rows?: number;
  count?: boolean;
  cardLines?: number;
  label?: string;
  /** Where the loaded list turns from cards into a table. */
  breakpoint?: "md" | "lg";
  className?: string;
}) {
  return (
    <SkeletonGroup label={label} className={className}>
      {count ? <SkeletonText width="6rem" /> : null}
      <div
        className={breakpoint === "lg" ? "hidden lg:block" : "hidden md:block"}
      >
        <TableSkeleton columns={columns} rows={rows} />
      </div>
      <RowCardsSkeleton
        rows={Math.min(rows, 3)}
        lines={cardLines}
        className={
          breakpoint === "lg" ? "space-y-2 lg:hidden" : "space-y-2 md:hidden"
        }
      />
    </SkeletonGroup>
  );
}

/** A table column header that only screen readers read, e.g. Actions. */
export function srOnly(text: string): ReactNode {
  return <span className="sr-only">{text}</span>;
}
