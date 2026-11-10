"use client";

import { useId, useState, type PointerEvent } from "react";

import type { DailyWorkDashboard } from "@/src/queries/site-work-dashboard";

type Day = DailyWorkDashboard["trend"][number];

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

function path(
  series: readonly Day[],
  pick: (day: Day) => number,
  x: (index: number) => number,
  y: (value: number) => number,
): string {
  return series
    .map(
      (day, index) =>
        `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(pick(day)).toFixed(1)}`,
    )
    .join(" ");
}

/**
 * Total Labours Availability (CM-608): worksheet labour (skilled +
 * unskilled) against attendance heads, day by day over the dashboard's
 * duration. Two 2px lines in the primary and second chart hues with a
 * legend; hover, touch or the arrow keys move a crosshair whose day is
 * read out above the chart. A table of every day sits behind it for
 * screen readers.
 */
export function LabourAvailabilityChart({
  series,
}: {
  series: readonly Day[];
}) {
  const [active, setActive] = useState(series.length - 1);
  const titleId = useId();
  const max = Math.max(
    1,
    ...series.map((day) => Math.max(day.worksheet, day.attendance)),
  );
  const last = Math.max(1, series.length - 1);
  const x = (index: number) => (index / last) * WIDTH;
  const y = (value: number) => HEIGHT - (value / max) * (HEIGHT - 8);
  const worksheetLine = path(series, (day) => day.worksheet, x, y);
  const attendanceLine = path(series, (day) => day.attendance, x, y);
  const shown = series[active] ?? series.at(-1);

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - box.left) / Math.max(1, box.width);
    setActive(Math.round(Math.min(1, Math.max(0, ratio)) * last));
  };

  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <figcaption id={titleId} className="text-sm font-semibold">
          Labour availability per day
        </figcaption>
        {shown == null ? null : (
          <p className="text-muted-foreground text-xs" aria-live="polite">
            {dayLabel(shown.date)}: {shown.worksheet} on worksheets,{" "}
            {shown.attendance} in attendance
          </p>
        )}
      </div>
      <ul
        className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 text-xs"
        aria-label="Legend"
      >
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="bg-primary inline-block h-0.5 w-4 rounded-full"
          />
          On worksheets
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className="bg-chart-2 inline-block h-0.5 w-4 rounded-full"
          />
          In attendance
        </li>
      </ul>
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
            : `${dayLabel(shown.date)}, ${String(shown.worksheet)} on worksheets, ${String(shown.attendance)} in attendance`
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
          <path
            d={attendanceLine}
            className="stroke-chart-2 fill-none"
            strokeWidth={2}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={worksheetLine}
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
          <>
            <span
              aria-hidden="true"
              className="bg-chart-2 ring-card absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
              style={{
                left: `${String((x(active) / WIDTH) * 100)}%`,
                top: `${String((y(shown.attendance) / HEIGHT) * 100)}%`,
              }}
            />
            <span
              aria-hidden="true"
              className="bg-primary ring-card absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
              style={{
                left: `${String((x(active) / WIDTH) * 100)}%`,
                top: `${String((y(shown.worksheet) / HEIGHT) * 100)}%`,
              }}
            />
          </>
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
      {/* A div clips to 1px; a table ignores the width and could widen the page. */}
      <div className="sr-only">
        <table>
          <caption>Labour on worksheets and in attendance per day</caption>
          <thead>
            <tr>
              <th scope="col">Day</th>
              <th scope="col">On worksheets</th>
              <th scope="col">In attendance</th>
            </tr>
          </thead>
          <tbody>
            {series.map((day) => (
              <tr key={day.date}>
                <th scope="row">{dayLabel(day.date)}</th>
                <td>{day.worksheet}</td>
                <td>{day.attendance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
