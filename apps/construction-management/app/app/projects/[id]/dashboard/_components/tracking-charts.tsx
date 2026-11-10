"use client";

import { useId, type CSSProperties } from "react";
import { cn } from "@repo/ui/lib/utils";

/**
 * Small charts of the Project Dashboard's tracking sections (CM-805), in
 * the style of the M6 / M7 sections: plain HTML and SVG, no chart library,
 * every colour paired with its label and figure.
 */

/** `42.5` → "42.5%"; whole numbers without decimals, at most two places. */
export function percentText(value: number): string {
  return `${String(Math.round(value * 100) / 100)}%`;
}

/**
 * A half-circle gauge for a percentage (Project Progress %, Success Rate):
 * the figure in the middle and a caption under it. `value` null draws an
 * empty track and "—".
 */
export function Gauge({
  label,
  value,
  caption,
}: {
  label: string;
  /** 0–100, or null when there is nothing to measure. */
  value: number | null;
  caption: string;
}) {
  const shown = value == null ? 0 : Math.max(0, Math.min(100, value));
  const text = value == null ? "—" : percentText(value);
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <div
        {...(value == null
          ? // A meter needs a value; with none it is a picture of "—".
            { role: "img", "aria-label": `${label}: no figure yet` }
          : {
              role: "meter",
              "aria-label": label,
              "aria-valuemin": 0,
              "aria-valuemax": 100,
              "aria-valuenow": value,
              "aria-valuetext": text,
            })}
        className="relative w-full max-w-56"
      >
        <svg viewBox="0 0 120 68" className="w-full" aria-hidden="true">
          <path
            d="M 10 60 A 50 50 0 0 1 110 60"
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            className="stroke-muted"
          />
          {shown > 0 ? (
            <path
              d="M 10 60 A 50 50 0 0 1 110 60"
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              pathLength={100}
              strokeDasharray={`${String(shown)} 100`}
              className="stroke-primary"
            />
          ) : null}
        </svg>
        <span className="absolute inset-x-0 bottom-0 text-2xl font-semibold tracking-tight tabular-nums">
          {text}
        </span>
      </div>
      <p className="text-sm font-medium">{label}</p>
      <p className="text-muted-foreground text-xs">{caption}</p>
    </div>
  );
}

export type BarItem = {
  key: string;
  label: string;
  count: number;
  /** A Tailwind background class for the swatch and the bar. */
  swatch?: string;
  /** Or a colour (priorities carry their own). */
  color?: string;
};

function swatchStyle(item: BarItem): CSSProperties | undefined {
  return item.color == null ? undefined : { backgroundColor: item.color };
}

/**
 * One horizontal bar per item with its label, count and share, like M7's
 * Module wise payment. Each row says its figure, so no hidden table is
 * needed.
 */
export function CountBars({
  title,
  items,
  empty,
}: {
  title: string;
  items: readonly BarItem[];
  /** Shown when every count is 0. */
  empty: string;
}) {
  const titleId = useId();
  const total = items.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(1, ...items.map((item) => item.count));
  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <figcaption id={titleId} className="text-sm font-semibold">
        {title}
      </figcaption>
      {total === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ol className="space-y-2.5" aria-labelledby={titleId}>
          {items.map((item) => (
            <li key={item.key} className="min-w-0 space-y-1">
              <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "inline-block size-2.5 shrink-0 rounded-sm ring-1 ring-black/10",
                      item.swatch ?? (item.color == null ? "bg-primary" : ""),
                    )}
                    style={swatchStyle(item)}
                  />
                  <span className="truncate">{item.label}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">
                  {item.count}
                  <span className="text-muted-foreground ml-1.5 text-xs font-normal">
                    {Math.round((item.count / total) * 100)}%
                  </span>
                </span>
              </div>
              <div
                className="bg-muted h-2 w-full rounded-full"
                aria-hidden="true"
              >
                <div
                  className={cn(
                    "h-2 rounded-full",
                    item.swatch ?? (item.color == null ? "bg-primary" : ""),
                  )}
                  style={{
                    ...swatchStyle(item),
                    width:
                      item.count === 0
                        ? "0"
                        : `max(2px, ${String((item.count / max) * 100)}%)`,
                  }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}

/** A legend of swatches and words, for charts with stacked segments. */
export function Legend({
  items,
}: {
  items: readonly Omit<BarItem, "count">[];
}) {
  return (
    <ul
      aria-label="Legend"
      className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
    >
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn(
              "inline-block size-2.5 rounded-sm",
              item.swatch ?? "bg-primary",
            )}
            style={
              item.color == null ? undefined : { backgroundColor: item.color }
            }
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/**
 * One bar split into coloured segments (assignee-wise issues by status);
 * the counts are written beside it by the caller.
 */
export function StackedBar({
  segments,
  max,
}: {
  segments: readonly BarItem[];
  /** The largest total among the rows, so bars compare. */
  max: number;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.count, 0);
  return (
    <div className="bg-muted h-2 w-full rounded-full" aria-hidden="true">
      <div
        className="flex h-2 gap-px overflow-hidden rounded-full"
        style={{
          width:
            total === 0
              ? "0"
              : `max(2px, ${String((total / Math.max(1, max)) * 100)}%)`,
        }}
      >
        {segments
          .filter((segment) => segment.count > 0)
          .map((segment) => (
            <div
              key={segment.key}
              className={cn("h-full", segment.swatch ?? "bg-primary")}
              style={{ flexGrow: segment.count, flexBasis: 0 }}
            />
          ))}
      </div>
    </div>
  );
}
