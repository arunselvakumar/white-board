"use client";

import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Button } from "@repo/ui/components/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { cn } from "@repo/ui/lib/utils";

import type { PersonAttendanceDay } from "@/src/queries/person-attendance";

import {
  STATUS_LABELS,
  countFigure,
  dayLabel,
  dayLevel,
  dayMark,
  formatLongDate,
  formatMinutes,
  formatMonth,
  monthFigures,
  placeLine,
  type Level,
  type Measure,
} from "./attendance-summary";

/**
 * The Attendance tab's calendar (ADR CM-0051 §2): a wall-calendar block
 * per month, side by side, newest on the right. A day's shade says how
 * much was worked; hovering or focusing it shows the Projects and hours.
 * Scrolling back loads earlier months until the person's first.
 */

const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** Shades from the theme's primary, so dark mode follows. */
const LEVEL_CLASSES: Record<Level, string> = {
  0: "bg-muted text-muted-foreground",
  1: "bg-primary/20 text-foreground",
  2: "bg-primary/45 text-foreground",
  3: "bg-primary/75 text-primary-foreground",
  4: "bg-primary text-primary-foreground",
};

const MARK_CLASSES = {
  absent: "bg-destructive/12 text-destructive",
  leave: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  off: "bg-muted/50 text-muted-foreground/70 bg-[repeating-linear-gradient(135deg,transparent_0_3px,var(--color-border)_3px_4px)]",
} as const;

export type CalendarMonth = { month: string; days: PersonAttendanceDay[] };

function daysIn(month: string): number {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Monday-first column (0–6) of the month's first day. */
function startOffset(month: string): number {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  return (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7;
}

export function AttendanceCalendar({
  months,
  measure,
  recordsAbsence,
  today,
  selectedMonth,
  onSelectMonth,
  hasEarlier,
  loadingEarlier,
  onLoadEarlier,
}: {
  /** Oldest first. */
  months: readonly CalendarMonth[];
  measure: Measure;
  recordsAbsence: boolean;
  today: string;
  selectedMonth: string;
  onSelectMonth: (month: string) => void;
  hasEarlier: boolean;
  loadingEarlier: boolean;
  onLoadEarlier: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLLIElement>(null);
  // Scroll width before older months were added, to stay on the same month.
  const widthBefore = useRef<number | null>(null);
  const firstMonth = months[0]?.month;

  const maxHeadDays = useMemo(
    () =>
      Math.max(
        0,
        ...months.flatMap((m) => m.days.map((day) => day.headDays ?? 0)),
      ),
    [months],
  );

  // Open on the newest month.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el != null) el.scrollLeft = el.scrollWidth;
  }, []);

  // After earlier months arrive, shift by the width they added.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (el == null || widthBefore.current == null) return;
    el.scrollLeft += el.scrollWidth - widthBefore.current;
    widthBefore.current = null;
  }, [firstMonth]);

  function loadEarlier() {
    if (!hasEarlier || loadingEarlier) return;
    widthBefore.current = scrollerRef.current?.scrollWidth ?? null;
    onLoadEarlier();
  }

  // The oldest end coming into view asks for more, however it got there.
  const loadRef = useRef(loadEarlier);
  useEffect(() => {
    loadRef.current = loadEarlier;
  });
  useEffect(() => {
    const root = scrollerRef.current;
    const sentinel = sentinelRef.current;
    if (root == null || sentinel == null || !hasEarlier) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) loadRef.current();
      },
      { root, rootMargin: "0px 0px 0px 160px" },
    );
    observer.observe(sentinel);
    return () => {
      observer.disconnect();
    };
  }, [hasEarlier]);

  // A month picked off-screen (the month switcher, or loaded for it)
  // scrolls into view; only the strip moves, never the page (the strip is the offset parent).
  useEffect(() => {
    const el = scrollerRef.current;
    const block = el?.querySelector<HTMLElement>(
      `[data-month="${selectedMonth}"]`,
    );
    if (el == null || block == null) return;
    const left = block.offsetLeft;
    const right = left + block.offsetWidth;
    if (left < el.scrollLeft) el.scrollLeft = left - 8;
    else if (right > el.scrollLeft + el.clientWidth)
      el.scrollLeft = right - el.clientWidth + 8;
  }, [selectedMonth, firstMonth]);

  function page(direction: -1 | 1) {
    const el = scrollerRef.current;
    if (el == null) return;
    el.scrollBy({
      left: direction * Math.max(el.clientWidth - 80, 160),
      behavior: "smooth",
    });
  }

  return (
    <section aria-label="Attendance calendar" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Legend measure={measure} recordsAbsence={recordsAbsence} />
        <div className="flex items-center gap-1">
          {loadingEarlier ? (
            <LoaderCircle
              className="text-muted-foreground mr-1 size-4 animate-spin"
              aria-label="Loading earlier months"
            />
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => {
              page(-1);
            }}
            aria-label="Earlier months"
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => {
              page(1);
            }}
            aria-label="Later months"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
      <div
        ref={scrollerRef}
        className="relative -mx-1 [scrollbar-width:thin] overflow-x-auto overscroll-x-contain px-1 pb-2"
      >
        <ol className="flex w-max items-start gap-5">
          {hasEarlier ? (
            <li
              ref={sentinelRef}
              className="flex h-56 w-20 shrink-0 items-center justify-center"
            >
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loadingEarlier}
                onClick={loadEarlier}
              >
                {loadingEarlier ? "Loading…" : "Earlier"}
              </Button>
            </li>
          ) : firstMonth != null ? (
            <li className="text-muted-foreground flex h-56 w-14 shrink-0 flex-col items-center justify-center gap-2 text-center text-[0.65rem] leading-tight font-medium">
              <span className="bg-border h-10 w-px" />
              Since
              <br />
              {formatMonth(firstMonth)}
              <span className="bg-border h-10 w-px" />
            </li>
          ) : null}
          {months.map((month) => (
            <MonthBlock
              key={month.month}
              month={month}
              measure={measure}
              maxHeadDays={maxHeadDays}
              today={today}
              selected={month.month === selectedMonth}
              onSelect={() => {
                onSelectMonth(month.month);
              }}
            />
          ))}
        </ol>
      </div>
    </section>
  );
}

function MonthBlock({
  month,
  measure,
  maxHeadDays,
  today,
  selected,
  onSelect,
}: {
  month: CalendarMonth;
  measure: Measure;
  maxHeadDays: number;
  today: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const total = daysIn(month.month);
  const offset = startOffset(month.month);
  const byDate = new Map(month.days.map((day) => [day.date, day]));
  const figures = monthFigures(month.days);
  const figure =
    measure === "head_days"
      ? figures.headDays > 0
        ? `${countFigure(figures.headDays)} head-days`
        : "—"
      : figures.daysWorked > 0
        ? `${countFigure(figures.daysWorked)} ${figures.daysWorked === 1 ? "day" : "days"}`
        : "—";

  return (
    <li
      data-month={month.month}
      className={cn(
        "shrink-0 rounded-xl p-2 transition-colors",
        selected ? "bg-primary/6 ring-primary/30 ring-1" : "",
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={selected}
        className="hover:bg-muted focus-visible:ring-ring mb-2 flex w-full items-baseline justify-between gap-3 rounded-md px-1 py-0.5 text-left outline-none focus-visible:ring-2"
      >
        <span
          className={cn(
            "text-sm font-semibold",
            selected ? "text-primary" : "text-foreground",
          )}
        >
          {formatMonth(month.month)}
        </span>
        <span
          className={cn(
            "text-xs tabular-nums",
            figure === "—"
              ? "text-muted-foreground/70"
              : "text-foreground/80 font-medium",
          )}
        >
          {figure}
        </span>
      </button>
      <div className="grid grid-cols-7 gap-1">
        {WEEKDAYS.map((weekday, i) => (
          <span
            key={i}
            aria-hidden="true"
            className="text-muted-foreground/60 h-4 text-center text-[0.6rem] leading-4 font-medium"
          >
            {weekday}
          </span>
        ))}
        {Array.from({ length: offset }, (_, i) => (
          <span key={`pad-${String(i)}`} aria-hidden="true" />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const date = `${month.month}-${String(i + 1).padStart(2, "0")}`;
          return (
            <DayCell
              key={date}
              date={date}
              day={byDate.get(date)}
              measure={measure}
              maxHeadDays={maxHeadDays}
              today={today}
            />
          );
        })}
      </div>
    </li>
  );
}

function DayCell({
  date,
  day,
  measure,
  maxHeadDays,
  today,
}: {
  date: string;
  day: PersonAttendanceDay | undefined;
  measure: Measure;
  maxHeadDays: number;
  today: string;
}) {
  const future = date > today;
  const level = dayLevel(day, measure, maxHeadDays);
  const mark = dayMark(day);
  const number = Number(date.slice(8));
  const className = cn(
    "flex size-7 items-center justify-center rounded-md text-[0.7rem] font-medium tabular-nums outline-none select-none",
    future
      ? "text-muted-foreground/35 bg-transparent"
      : mark != null
        ? MARK_CLASSES[mark]
        : LEVEL_CLASSES[level],
    date === today && "ring-foreground ring-offset-card ring-2 ring-offset-1",
  );
  if (day == null)
    return (
      <span
        className={className}
        data-level={future ? undefined : 0}
        aria-hidden="true"
      >
        {number}
      </span>
    );
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={dayLabel(date, day, measure)}
            data-level={level}
            data-status={day.status}
            className={cn(
              className,
              "focus-visible:ring-ring cursor-default transition-transform duration-150 hover:scale-110 focus-visible:scale-110 focus-visible:ring-2 motion-reduce:transition-none motion-reduce:hover:scale-100",
            )}
          />
        }
      >
        {number}
      </TooltipTrigger>
      <TooltipContent className="block w-64 max-w-[calc(100vw-1rem)] p-3">
        <DayDetail date={date} day={day} measure={measure} />
      </TooltipContent>
    </Tooltip>
  );
}

/** What the hover shows: the day, its status, and each place with its hours. */
function DayDetail({
  date,
  day,
  measure,
}: {
  date: string;
  day: PersonAttendanceDay;
  measure: Measure;
}) {
  const total =
    measure === "head_days"
      ? `${countFigure(day.headDays ?? 0)} head-days`
      : formatMinutes(day.workedMinutes);
  return (
    <div className="space-y-2 text-left">
      <p className="flex items-baseline justify-between gap-3 text-xs">
        <span className="font-semibold">{formatLongDate(date)}</span>
        <span className="text-background/70">{STATUS_LABELS[day.status]}</span>
      </p>
      {day.places.length > 0 ? (
        <ul className="space-y-1.5">
          {day.places.map((place) => {
            const line = placeLine(place);
            return (
              <li
                key={`${place.place.kind}:${place.place.id}`}
                className="text-sm leading-tight"
              >
                <span className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">
                    {line.name}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {line.figure}
                  </span>
                </span>
                {line.detail.length > 0 ? (
                  <span className="text-background/65 block text-[0.7rem]">
                    {line.detail.join(" · ")}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      {day.places.length > 1 ? (
        <p className="border-background/15 flex justify-between border-t pt-1.5 text-xs">
          <span className="text-background/70">Total</span>
          <span className="font-semibold tabular-nums">{total}</span>
        </p>
      ) : null}
    </div>
  );
}

function Legend({
  measure,
  recordsAbsence,
}: {
  measure: Measure;
  recordsAbsence: boolean;
}) {
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
      <span className="flex items-center gap-1" aria-hidden="true">
        Less
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span
            key={level}
            className={cn("size-3.5 rounded-[4px]", LEVEL_CLASSES[level])}
          />
        ))}
        More
      </span>
      <span className="sr-only">
        {measure === "head_days"
          ? "Darker days had more head-days."
          : "Darker days had more hours worked."}
      </span>
      {recordsAbsence ? (
        <>
          <LegendMark className={MARK_CLASSES.absent} label="Absent" />
          <LegendMark className={MARK_CLASSES.leave} label="Leave" />
          <LegendMark className={MARK_CLASSES.off} label="Holiday" />
        </>
      ) : null}
      <span className="hidden sm:inline">· Hover a day for details</span>
    </div>
  );
}

function LegendMark({
  className,
  label,
}: {
  className: string;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        aria-hidden="true"
        className={cn("size-3.5 rounded-[4px]", className)}
      />
      {label}
    </span>
  );
}
