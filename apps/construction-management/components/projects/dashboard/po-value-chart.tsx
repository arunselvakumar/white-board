"use client";

import { useId, useState } from "react";
import { cn } from "@repo/ui/lib/utils";

import { formatPaise } from "@/components/money/money-input";

type Month = { month: string; value: number };

const MONTH = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function monthLabel(month: string): string {
  return MONTH.format(new Date(`${month}-01T00:00:00Z`));
}

/**
 * "Purchase order value per month" over the dashboard's duration (CM-510):
 * one series, so the title names it and there is no legend. Bars in the
 * primary hue with 4px rounded tops on a recessive baseline and a 2px gap;
 * hover, touch or the arrow keys pick a month whose value is read out
 * above the chart. A table of every month sits behind it for screen
 * readers.
 */
export function PoValueChart({ months }: { months: readonly Month[] }) {
  const [active, setActive] = useState(months.length - 1);
  const titleId = useId();
  const max = Math.max(1, ...months.map((month) => month.value));
  const shown = months[active] ?? months.at(-1);
  const last = Math.max(0, months.length - 1);

  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption id={titleId} className="text-sm font-semibold">
          Purchase order value per month
        </figcaption>
        {shown == null ? null : (
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {monthLabel(shown.month)}: {formatPaise(shown.value)}
          </p>
        )}
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Month"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={active}
        aria-valuetext={
          shown == null
            ? undefined
            : `${monthLabel(shown.month)}, ${formatPaise(shown.value)}`
        }
        className="focus-visible:ring-ring/50 border-border flex h-40 w-full touch-pan-y items-end gap-0.5 rounded-md border-b outline-none focus-visible:ring-3"
        onPointerLeave={() => {
          setActive(last);
        }}
        onKeyDown={(event) => {
          const step =
            event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
          if (step === 0) return;
          event.preventDefault();
          setActive((current) => Math.min(last, Math.max(0, current + step)));
        }}
      >
        {months.map((month, index) => (
          <div
            key={month.month}
            aria-hidden="true"
            className="flex h-full min-w-0 flex-1 items-end"
            onPointerEnter={() => {
              setActive(index);
            }}
            onPointerDown={() => {
              setActive(index);
            }}
          >
            <div
              className={cn(
                "w-full rounded-t-[4px] transition-colors",
                index === active ? "bg-primary" : "bg-primary/55",
              )}
              style={{
                height:
                  month.value === 0
                    ? "0"
                    : `max(2px, ${String((month.value / max) * 100)}%)`,
              }}
            />
          </div>
        ))}
      </div>
      <div
        className="text-muted-foreground flex justify-between text-[0.7rem]"
        aria-hidden="true"
      >
        <span>{months[0] == null ? "" : monthLabel(months[0].month)}</span>
        <span>
          {months.at(-1) == null ? "" : monthLabel(months.at(-1)?.month ?? "")}
        </span>
      </div>
      <table className="sr-only">
        <caption>Purchase order value per month</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">Value</th>
          </tr>
        </thead>
        <tbody>
          {months.map((month) => (
            <tr key={month.month}>
              <th scope="row">{monthLabel(month.month)}</th>
              <td>{formatPaise(month.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
