"use client";

import { useId, useState, type PointerEvent } from "react";

import type { ProjectLabourSummary } from "@/src/queries/labour-summary";

type Day = ProjectLabourSummary["presentSeries"][number];

const DAY = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function dayLabel(date: string): string {
  return DAY.format(new Date(`${date}T00:00:00Z`));
}

const WIDTH = 600;
const HEIGHT = 160;

/**
 * "Labours present at site" day by day over the dashboard's duration
 * (CM-412): one series, so the title names it and there is no legend. A
 * 2px line over a light area on a recessive baseline; hover, touch or the
 * arrow keys move a crosshair whose day is read out above the chart. A
 * table of every day sits behind it for screen readers.
 */
export function AttendanceTrend({ series }: { series: readonly Day[] }) {
  const [active, setActive] = useState(series.length - 1);
  const titleId = useId();
  const max = Math.max(1, ...series.map((day) => day.present));
  const last = Math.max(1, series.length - 1);
  const x = (index: number) => (index / last) * WIDTH;
  const y = (present: number) => HEIGHT - (present / max) * (HEIGHT - 8);
  const line = series
    .map(
      (day, index) =>
        `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(day.present).toFixed(1)}`,
    )
    .join(" ");
  const area = `${line} L${String(WIDTH)},${String(HEIGHT)} L0,${String(HEIGHT)} Z`;
  const shown = series[active] ?? series.at(-1);
  const total = series.reduce((sum, day) => sum + day.present, 0);
  const peak = series.reduce<Day | undefined>(
    (best, day) => (best == null || day.present > best.present ? day : best),
    undefined,
  );

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / Math.max(1, box.width);
    setActive(Math.round(Math.min(1, Math.max(0, ratio)) * last));
  };

  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption id={titleId} className="text-sm font-semibold">
          Labours present per day
        </figcaption>
        {shown == null ? null : (
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {dayLabel(shown.date)}: {shown.present} present
            {shown.vendorHeadcount > 0
              ? `, ${String(shown.vendorHeadcount)} vendor heads`
              : ""}
          </p>
        )}
      </div>
      <div
        role="slider"
        tabIndex={0}
        aria-label="Day"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={active}
        aria-valuetext={
          shown == null
            ? undefined
            : `${dayLabel(shown.date)}, ${String(shown.present)} present`
        }
        className="focus-visible:ring-ring/50 relative h-40 w-full touch-pan-y rounded-md outline-none focus-visible:ring-3"
        onPointerMove={pick}
        onPointerDown={pick}
        onPointerLeave={() => {
          setActive(series.length - 1);
        }}
        onKeyDown={(event) => {
          const step =
            event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
          if (step === 0) return;
          event.preventDefault();
          setActive((current) => Math.min(last, Math.max(0, current + step)));
        }}
      >
        <svg
          aria-hidden="true"
          viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
          preserveAspectRatio="none"
          className="absolute inset-0 size-full overflow-visible"
        >
          <line
            x1={0}
            x2={WIDTH}
            y1={HEIGHT}
            y2={HEIGHT}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <path d={area} className="fill-primary/12" />
          <path
            d={line}
            className="stroke-primary fill-none"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {shown == null ? null : (
            <line
              x1={x(active)}
              x2={x(active)}
              y1={0}
              y2={HEIGHT}
              className="stroke-muted-foreground/60"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {shown == null ? null : (
          <span
            aria-hidden="true"
            className="bg-primary ring-card absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
            style={{
              left: `${String((x(active) / WIDTH) * 100)}%`,
              top: `${String((y(shown.present) / HEIGHT) * 100)}%`,
            }}
          />
        )}
      </div>
      <div
        className="text-muted-foreground flex justify-between text-[0.7rem]"
        aria-hidden="true"
      >
        <span>{series[0] == null ? "" : dayLabel(series[0].date)}</span>
        <span>
          {series.at(-1) == null ? "" : dayLabel(series.at(-1)?.date ?? "")}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">
        {total === 0
          ? "No labour was marked present in this period."
          : `${String(total)} labour-days in all; most on ${dayLabel(peak?.date ?? "")} (${String(peak?.present ?? 0)}).`}
      </p>
      <table className="sr-only">
        <caption>Labours present and vendor heads per day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Labours present</th>
            <th scope="col">Vendor heads</th>
          </tr>
        </thead>
        <tbody>
          {series.map((day) => (
            <tr key={day.date}>
              <th scope="row">{dayLabel(day.date)}</th>
              <td>{day.present}</td>
              <td>{day.vendorHeadcount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
