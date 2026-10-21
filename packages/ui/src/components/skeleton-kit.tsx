"use client";

import { cn } from "cn";
import { createContext, type ReactNode, useContext } from "react";

import { Card, CardContent, CardHeader } from "./card";
import { Item, ItemActions, ItemContent, ItemMedia } from "./item";
import { Skeleton, skeletonClassName } from "./skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./table";

/*
 * Skeletons shaped like the blocks pages are built from (ADR-0047). A page
 * renders what it knows without fetching (title, tabs, filters, column
 * headers) for real and uses these only where fetched data will appear.
 */

/** Widths that vary row to row, so a list doesn't read as a stack of bars. */
const TEXT_WIDTHS = ["72%", "54%", "86%", "63%", "47%", "78%", "58%"];

function widthAt(index: number, offset = 0): string {
  return TEXT_WIDTHS[(index + offset) % TEXT_WIDTHS.length] ?? "60%";
}

/**
 * Wraps a skeleton with one "Loading" for screen readers. The bars carry no
 * text; real chrome inside (headers, labels) stays readable. The label comes
 * first and is out of flow, so `space-y-*`, `gap-*` and grids lay out the
 * children as if it weren't there.
 */
/** True inside a `SkeletonGroup`, so a nested one doesn't announce again. */
const InSkeletonGroup = createContext(false);

function SkeletonGroup({
  label = "Loading",
  className,
  children,
}: {
  /** What is loading, read by screen readers, e.g. "Loading Vendors". */
  label?: string;
  className?: string;
  children: ReactNode;
}) {
  const nested = useContext(InSkeletonGroup);
  if (nested) return <div className={className}>{children}</div>;
  return (
    <div role="status" aria-busy="true" className={className}>
      <span className="sr-only">{label}</span>
      <InSkeletonGroup value={true}>{children}</InSkeletonGroup>
    </div>
  );
}

const TEXT_SIZES = {
  xs: { line: "h-4", bar: "h-2.5" },
  sm: { line: "h-5", bar: "h-3" },
  base: { line: "h-6", bar: "h-3.5" },
  lg: { line: "h-7", bar: "h-4" },
  xl: { line: "h-7", bar: "h-5" },
  "2xl": { line: "h-8", bar: "h-6" },
  "3xl": { line: "h-9", bar: "h-7" },
} as const;

/**
 * One line of text. The wrapper takes the line height of that text size, so
 * the layout doesn't shift when the real text arrives. Spans only, so it can
 * sit inside a heading, paragraph or button.
 */
function SkeletonText({
  size = "sm",
  width = "60%",
  className,
}: {
  size?: keyof typeof TEXT_SIZES;
  /** Any CSS width: "60%", "8rem". */
  width?: string;
  className?: string;
}) {
  const { line, bar } = TEXT_SIZES[size];
  return (
    <span
      data-slot="skeleton-text"
      className={cn("flex items-center", line, className)}
      style={{ width }}
    >
      <span
        data-slot="skeleton"
        className={cn(skeletonClassName, "block w-full rounded-sm", bar)}
      />
    </span>
  );
}

type SkeletonColumnKind =
  /** A name or title, in the foreground colour. */
  | "text"
  /** Secondary text: a phone, a date, a project. */
  | "muted"
  /** A right-aligned figure. */
  | "number"
  | "badge"
  /** A row's icon button, e.g. the actions menu. */
  | "actions"
  | "checkbox"
  /** An avatar or thumbnail before a name. */
  | "avatar";

type SkeletonColumn = {
  /** The column's real header, as the loaded table shows it. */
  header: ReactNode;
  kind?: SkeletonColumnKind;
  /** The loaded `TableHead`'s className, e.g. "text-right", "w-12". */
  className?: string;
};

function TableSkeletonCell({
  kind,
  row,
  column,
}: {
  kind: SkeletonColumnKind;
  row: number;
  column: number;
}) {
  switch (kind) {
    case "number":
      return <SkeletonText width="4.5rem" className="ml-auto" />;
    case "badge":
      return <Skeleton className="h-5 w-16 rounded-full" />;
    case "actions":
      return <Skeleton className="size-9 rounded-md" />;
    case "checkbox":
      return <Skeleton className="size-4 rounded-[4px]" />;
    case "avatar":
      return (
        <div className="flex items-center gap-2.5">
          <Skeleton className="size-8 shrink-0 rounded-full" />
          <SkeletonText width={widthAt(row, column)} className="flex-1" />
        </div>
      );
    case "muted":
      return (
        <SkeletonText width={`calc(${widthAt(row, column + 3)} * 0.75)`} />
      );
    case "text":
      return <SkeletonText width={widthAt(row, column)} />;
  }
}

/**
 * A table with the loaded table's real column headers and placeholder rows
 * shaped per column. `count` adds the "N Vendors" line many lists show above
 * the table.
 */
function TableSkeleton({
  columns,
  rows = 5,
  label,
  count = false,
  bordered = true,
  className,
}: {
  columns: SkeletonColumn[];
  rows?: number;
  label?: string;
  count?: boolean;
  /** The `rounded-lg border` frame list pages put around their table. */
  bordered?: boolean;
  className?: string;
}) {
  const table = (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {columns.map((column, index) => (
            <TableHead key={index} className={column.className}>
              {column.header}
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }, (_, row) => (
          <TableRow key={row} className="hover:bg-transparent">
            {columns.map((column, index) => (
              <TableCell key={index} className={column.className}>
                <TableSkeletonCell
                  kind={column.kind ?? "text"}
                  row={row}
                  column={index}
                />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <SkeletonGroup label={label} className={cn("space-y-3", className)}>
      {count ? <SkeletonText width="5rem" /> : null}
      {/* Hidden from screen readers: a scrollable table with nothing to focus fails axe, and the group's label says it all. */}
      <div aria-hidden="true" className={cn(bordered && "rounded-lg border")}>
        {table}
      </div>
    </SkeletonGroup>
  );
}

/** A list of `Item` rows: optional media, a title and description, a trailing badge or action. */
function ItemListSkeleton({
  rows = 4,
  media = false,
  lines = 2,
  trailing = false,
  variant = "outline",
  label,
  className,
}: {
  rows?: number;
  media?: false | "icon" | "avatar" | "image";
  lines?: 1 | 2 | 3;
  trailing?: false | "badge" | "action" | "number";
  variant?: "default" | "outline" | "muted";
  label?: string;
  className?: string;
}) {
  return (
    <SkeletonGroup
      label={label}
      className={cn("flex flex-col gap-2", className)}
    >
      {Array.from({ length: rows }, (_, row) => (
        <Item key={row} variant={variant}>
          {media === false ? null : (
            <ItemMedia>
              <Skeleton
                className={cn(
                  media === "avatar" && "size-10 rounded-full",
                  media === "icon" && "size-8 rounded-sm",
                  media === "image" && "size-12 rounded-md",
                )}
              />
            </ItemMedia>
          )}
          <ItemContent>
            <SkeletonText width={widthAt(row)} />
            {lines >= 2 ? (
              <SkeletonText width={`calc(${widthAt(row, 3)} * 0.7)`} />
            ) : null}
            {lines >= 3 ? (
              <SkeletonText width={`calc(${widthAt(row, 5)} * 0.5)`} />
            ) : null}
          </ItemContent>
          {trailing === false ? null : (
            <ItemActions>
              {trailing === "badge" ? (
                <Skeleton className="h-5 w-16 rounded-full" />
              ) : trailing === "action" ? (
                <Skeleton className="size-9 rounded-md" />
              ) : (
                <SkeletonText width="4.5rem" />
              )}
            </ItemActions>
          )}
        </Item>
      ))}
    </SkeletonGroup>
  );
}

/**
 * Mirrors `MetricCard`: icon and label at the top, the figure, a caption.
 * Pass the real labels when the page knows them; they render as text.
 */
function MetricCardSkeleton({
  label,
  icon = true,
  caption = true,
  className,
}: {
  label?: ReactNode;
  icon?: boolean;
  /** `true` for a caption bar, or the real caption when it needs no data. */
  caption?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-slot="metric-card-skeleton"
      className={cn(
        "bg-card text-card-foreground ring-foreground/[0.06] flex min-h-40 min-w-0 flex-col rounded-[0.625rem] p-4 ring-1 sm:min-h-48 sm:p-5",
        className,
      )}
    >
      <span className="flex min-w-0 flex-col gap-2.5">
        {icon ? <Skeleton className="size-5 rounded-sm" /> : null}
        {label == null ? (
          <SkeletonText width="60%" />
        ) : (
          <span className="text-sm leading-snug sm:text-base">{label}</span>
        )}
      </span>
      <span className="mt-auto pt-4 sm:pt-6">
        <Skeleton className="h-8 w-24 rounded-sm sm:h-10" />
      </span>
      {caption === true ? (
        <SkeletonText width="75%" className="mt-3" />
      ) : caption === false || caption == null ? null : (
        <span className="text-muted-foreground mt-3 line-clamp-2 text-sm leading-snug">
          {caption}
        </span>
      )}
    </div>
  );
}

/** A grid of `MetricCardSkeleton`s. Pass the loaded grid's className so the columns match. */
function MetricGridSkeleton({
  count = 4,
  labels,
  icon,
  caption,
  captions,
  label,
  className = "grid grid-cols-2 gap-3 lg:grid-cols-4",
}: {
  count?: number;
  /** Real card labels, when the page knows them without fetching. */
  labels?: ReactNode[];
  icon?: boolean;
  caption?: boolean;
  /** Real captions, card by card; overrides `caption`. */
  captions?: ReactNode[];
  label?: string;
  className?: string;
}) {
  const total = labels?.length ?? count;
  return (
    <SkeletonGroup label={label} className={className}>
      {Array.from({ length: total }, (_, index) => (
        <MetricCardSkeleton
          key={index}
          label={labels?.[index]}
          icon={icon}
          caption={captions?.[index] ?? caption}
        />
      ))}
    </SkeletonGroup>
  );
}

type SkeletonField = {
  /** The field's real label. */
  label?: ReactNode;
  control?: "input" | "textarea" | "select" | "checkbox" | "switch" | "radio";
  /** Grid span in a two-column form. */
  wide?: boolean;
};

function FormSkeletonControl({
  control,
}: {
  control: NonNullable<SkeletonField["control"]>;
}) {
  switch (control) {
    case "textarea":
      return <Skeleton className="h-24 w-full" />;
    case "checkbox":
    case "switch":
    case "radio":
      return null;
    case "input":
    case "select":
      return <Skeleton className="h-9 w-full" />;
  }
}

/**
 * Label and control pairs. Labels the page knows render as text; a field
 * without one gets a label-sized bar.
 */
function FormSkeleton({
  fields,
  columns = 1,
  actions = 1,
  label,
  className,
}: {
  fields: number | SkeletonField[];
  columns?: 1 | 2;
  /** Buttons in the footer; 0 for none. */
  actions?: number;
  label?: string;
  className?: string;
}) {
  const list: SkeletonField[] =
    typeof fields === "number"
      ? Array.from({ length: fields }, () => ({}))
      : fields;
  return (
    <SkeletonGroup label={label} className={cn("space-y-6", className)}>
      <div className={cn("grid gap-5", columns === 2 && "sm:grid-cols-2")}>
        {list.map((field, index) => {
          const control = field.control ?? "input";
          const inline =
            control === "checkbox" ||
            control === "switch" ||
            control === "radio";
          const text =
            field.label == null ? (
              <SkeletonText width={widthAt(index, 2)} className="max-w-40" />
            ) : (
              <span className="text-sm leading-none font-medium">
                {field.label}
              </span>
            );
          return (
            <div
              key={index}
              className={cn(
                inline ? "flex items-center gap-2" : "grid gap-2",
                field.wide && "sm:col-span-2",
              )}
            >
              {inline ? (
                <Skeleton
                  className={cn(
                    control === "switch"
                      ? "h-5 w-9 rounded-full"
                      : control === "radio"
                        ? "size-4 rounded-full"
                        : "size-4 rounded-[4px]",
                  )}
                />
              ) : null}
              {text}
              <FormSkeletonControl control={control} />
            </div>
          );
        })}
      </div>
      {actions > 0 ? (
        <div className="flex justify-end gap-2">
          {Array.from({ length: actions }, (_, index) => (
            <Skeleton key={index} className="h-9 w-24" />
          ))}
        </div>
      ) : null}
    </SkeletonGroup>
  );
}

/**
 * A tab list whose tabs come from data, over its panel. When the tab names
 * are known without fetching, render the real `Tabs` instead.
 */
function TabsSkeleton({
  tabs = 3,
  label,
  className,
  children,
}: {
  tabs?: number;
  label?: string;
  className?: string;
  /** The first panel's skeleton. */
  children?: ReactNode;
}) {
  return (
    <SkeletonGroup
      label={label}
      className={cn("flex flex-col gap-4", className)}
    >
      <div className="border-border/70 bg-secondary/70 inline-flex h-11 w-fit items-center gap-1 rounded-xl border p-1">
        {Array.from({ length: tabs }, (_, index) => (
          <span key={index} className="flex h-full items-center px-3">
            <Skeleton
              className="h-3 rounded-sm"
              style={{ width: `${String(3.5 + (index % 3))}rem` }}
            />
          </span>
        ))}
      </div>
      {children}
    </SkeletonGroup>
  );
}

/** A grid of `Card`s with a title, description and optional body lines. */
function CardGridSkeleton({
  count = 6,
  lines = 0,
  media = false,
  label,
  className = "grid gap-4 sm:grid-cols-2 lg:grid-cols-3",
}: {
  count?: number;
  /** Body lines under the header. */
  lines?: number;
  /** An icon square before the title. */
  media?: boolean;
  label?: string;
  className?: string;
}) {
  return (
    <SkeletonGroup label={label} className={className}>
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardHeader className="flex items-start gap-3">
            {media ? <Skeleton className="size-9 shrink-0 rounded-md" /> : null}
            <div className="flex flex-1 flex-col gap-1">
              <SkeletonText size="base" width={widthAt(index)} />
              <SkeletonText width={`calc(${widthAt(index, 4)} * 0.8)`} />
            </div>
          </CardHeader>
          {lines > 0 ? (
            <CardContent className="flex flex-col gap-1">
              {Array.from({ length: lines }, (_, line) => (
                <SkeletonText key={line} width={widthAt(index, line + 1)} />
              ))}
            </CardContent>
          ) : null}
        </Card>
      ))}
    </SkeletonGroup>
  );
}

/**
 * A month or attendance grid: a name column, then one narrow column per day.
 * Pass the real day headers; the grid keeps its column count while loading.
 */
function CalendarGridSkeleton({
  headers,
  totals = [],
  rows = 6,
  nameHeader,
  label,
  className,
}: {
  /** One per day column, e.g. ["1", "2", …] or weekday labels. */
  headers: ReactNode[];
  /** Totals columns after the days, e.g. ["P", "A", "OT h"]: figures, not day squares. */
  totals?: ReactNode[];
  rows?: number;
  /** The first column's header, e.g. "Labour". */
  nameHeader?: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <SkeletonGroup label={label} className={cn("rounded-lg border", className)}>
      <div aria-hidden="true">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="min-w-40">{nameHeader}</TableHead>
              {headers.map((header, index) => (
                <TableHead key={index} className="px-1 text-center">
                  {header}
                </TableHead>
              ))}
              {totals.map((header, index) => (
                <TableHead
                  key={`total-${String(index)}`}
                  className="text-right"
                >
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rows }, (_, row) => (
              <TableRow key={row} className="hover:bg-transparent">
                <TableCell>
                  <SkeletonText width={widthAt(row)} />
                </TableCell>
                {headers.map((_, index) => (
                  <TableCell key={index} className="px-1">
                    <Skeleton className="mx-auto size-7 rounded-md" />
                  </TableCell>
                ))}
                {totals.map((_, index) => (
                  <TableCell key={`total-${String(index)}`}>
                    <SkeletonText width="1.75rem" className="ml-auto" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </SkeletonGroup>
  );
}

export {
  CalendarGridSkeleton,
  CardGridSkeleton,
  FormSkeleton,
  ItemListSkeleton,
  MetricCardSkeleton,
  MetricGridSkeleton,
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
  TabsSkeleton,
};
export type { SkeletonColumn, SkeletonColumnKind, SkeletonField };
