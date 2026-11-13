"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { Button } from "@repo/ui/components/button";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { cn } from "@repo/ui/lib/utils";

import { VISIT_STATUS_LABELS } from "@/src/marketing/domain/marketing-terms";
import {
  visitCalendarQuery,
  visitPath,
  type VisitFilters,
  type VisitListItem,
} from "@/src/queries/marketing-visits";

import {
  calendarDays,
  dayWords,
  spanTitle,
  WEEKDAYS,
  weekdayWord,
  type CalendarSpan,
} from "./visit-calendar-dates";
import {
  CheckedInMark,
  STATUS_CLASSES,
  VisitStatusBadge,
  visitTime,
  zoneFields,
} from "./visit-parts";

const SPANS: { value: CalendarSpan; label: string }[] = [
  { value: "month", label: "Month" },
  { value: "week", label: "Week" },
];

/** The dot under a phone's day for each status, Missed the loudest. */
const DOT_CLASSES: Record<VisitListItem["status"], string> = {
  planned: "bg-sky-500",
  missed: "bg-red-600",
  completed: "bg-emerald-500",
  cancelled: "bg-muted-foreground/50",
};

/** Month cells on a wide screen list this many, then "+2 more". */
const CELL_LIMIT = 3;

function visits(n: number): string {
  return `${String(n)} ${n === 1 ? "Visit" : "Visits"}`;
}

/** Month / Week, previous, today and next, and the span's name. */
export function CalendarToolbar({
  span,
  day,
  today,
  onSpan,
  onPrevious,
  onNext,
  onToday,
}: {
  span: CalendarSpan;
  day: string;
  today: string;
  onSpan: (span: CalendarSpan) => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
}) {
  const word = span === "month" ? "month" : "week";
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
      <ToggleGroup
        aria-label="Calendar span"
        value={[span]}
        onValueChange={(next: string[]) => {
          const picked = SPANS.find((item) => item.value === next[0]);
          if (picked != null) onSpan(picked.value);
        }}
        variant="outline"
        size="sm"
      >
        {SPANS.map((item) => (
          <ToggleGroupItem key={item.value} value={item.value}>
            {item.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Previous ${word}`}
          onClick={onPrevious}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={day === today}
          onClick={onToday}
        >
          Today
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={`Next ${word}`}
          onClick={onNext}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <h2 className="font-semibold" aria-live="polite">
        {spanTitle(span, day)}
      </h2>
    </div>
  );
}

/**
 * The Visits of the days shown, read in one go with the list's other
 * filters; days are the Company's (the list answer's `timeZone`). Month
 * is a grid with the chosen day's Visits under it; Week is seven columns,
 * stacked as an agenda on a phone.
 */
export function VisitsCalendar({
  filters,
  span,
  day,
  today,
  onDay,
}: {
  filters: Omit<VisitFilters, "from" | "to">;
  span: CalendarSpan;
  day: string;
  today: string;
  onDay: (day: string) => void;
}) {
  const days = calendarDays(span, day);
  const { data } = useSuspenseQuery(
    visitCalendarQuery(filters, days[0] ?? day, days.at(-1) ?? day),
  );
  const { timeZone } = data;
  const byDay = new Map<string, VisitListItem[]>();
  for (const item of [...data.items].sort((a, b) =>
    a.visitAt.localeCompare(b.visitAt),
  )) {
    const date = zoneFields(new Date(item.visitAt), timeZone).date;
    byDay.set(date, [...(byDay.get(date) ?? []), item]);
  }
  const on = (date: string) => byDay.get(date) ?? [];

  return (
    <div className="min-w-0 space-y-3">
      {data.nextCursor != null && (
        <p
          role="note"
          className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100"
        >
          {`Showing ${String(data.items.length)} of ${visits(data.total)} in these days. Narrow the filters to see the rest.`}
        </p>
      )}
      {span === "month" ? (
        <>
          <MonthGrid
            days={days}
            day={day}
            today={today}
            timeZone={timeZone}
            on={on}
            onDay={onDay}
          />
          <DayAgenda day={day} items={on(day)} timeZone={timeZone} />
        </>
      ) : (
        <WeekColumns days={days} today={today} timeZone={timeZone} on={on} />
      )}
    </div>
  );
}

function MonthGrid({
  days,
  day,
  today,
  timeZone,
  on,
  onDay,
}: {
  days: string[];
  day: string;
  today: string;
  timeZone: string;
  on: (date: string) => VisitListItem[];
  onDay: (day: string) => void;
}) {
  const month = day.slice(0, 7);
  return (
    <div className="bg-card min-w-0 overflow-hidden rounded-lg border">
      <div
        aria-hidden="true"
        className="text-muted-foreground grid grid-cols-7 border-b text-center text-xs"
      >
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} className="py-1.5">
            {weekday}
          </span>
        ))}
      </div>
      <ol aria-label={spanTitle("month", day)} className="grid grid-cols-7">
        {days.map((date) => {
          const items = on(date);
          const more = items.length - CELL_LIMIT;
          return (
            <li
              key={date}
              className={cn(
                "min-w-0 border-r border-b p-0.5 sm:min-h-28 sm:p-1 [&:nth-child(7n)]:border-r-0",
                date.slice(0, 7) !== month && "bg-muted/40",
              )}
            >
              <Button
                type="button"
                variant="ghost"
                aria-pressed={date === day}
                aria-label={`${dayWords(date)}, ${items.length === 0 ? "no Visits" : visits(items.length)}`}
                className={cn(
                  "h-auto w-full flex-col gap-1 px-0 py-1 sm:items-start sm:px-1 sm:py-0.5",
                  date === day && "bg-accent",
                )}
                onClick={() => {
                  onDay(date);
                }}
              >
                <span
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full text-xs tabular-nums",
                    date.slice(0, 7) !== month && "text-muted-foreground",
                    date === today &&
                      "bg-primary text-primary-foreground font-semibold",
                  )}
                >
                  {Number(date.slice(8))}
                </span>
                <span
                  aria-hidden="true"
                  className="flex h-1.5 items-center gap-0.5 sm:hidden"
                >
                  {items.slice(0, CELL_LIMIT).map((item) => (
                    <span
                      key={item.id}
                      className={cn(
                        "size-1.5 rounded-full",
                        DOT_CLASSES[item.status],
                      )}
                    />
                  ))}
                </span>
              </Button>
              {items.length > 0 && (
                <ul className="mt-0.5 hidden space-y-0.5 sm:block">
                  {items.slice(0, CELL_LIMIT).map((item) => (
                    <li key={item.id}>
                      <CalendarEntry visit={item} timeZone={timeZone} compact />
                    </li>
                  ))}
                  {more > 0 && (
                    <li>
                      <Button
                        type="button"
                        variant="link"
                        size="xs"
                        className="h-auto px-1 py-0"
                        onClick={() => {
                          onDay(date);
                        }}
                      >
                        {`+${String(more)} more`}
                      </Button>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** The chosen day's Visits under the month, in full. */
function DayAgenda({
  day,
  items,
  timeZone,
}: {
  day: string;
  items: VisitListItem[];
  timeZone: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-2">
      <h3 id={id} className="text-sm font-semibold">
        {dayWords(day)}
        <span className="text-muted-foreground font-normal">
          {` · ${items.length === 0 ? "no Visits" : visits(items.length)}`}
        </span>
      </h3>
      {items.length > 0 && (
        <ul aria-label={`Visits on ${dayWords(day)}`} className="space-y-2">
          {items.map((item) => (
            <li key={item.id}>
              <AgendaEntry visit={item} timeZone={timeZone} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function WeekColumns({
  days,
  today,
  timeZone,
  on,
}: {
  days: string[];
  today: string;
  timeZone: string;
  on: (date: string) => VisitListItem[];
}) {
  return (
    <ol
      aria-label={spanTitle("week", days[0] ?? today)}
      className="grid min-w-0 gap-2 md:grid-cols-7"
    >
      {days.map((date) => {
        const items = on(date);
        return (
          <li
            key={date}
            aria-label={dayWords(date)}
            className={cn(
              "bg-card min-w-0 space-y-2 rounded-lg border p-2 md:min-h-40",
              date === today && "border-primary",
            )}
          >
            <p className="flex items-baseline gap-1.5 text-sm">
              <span className="text-muted-foreground">{weekdayWord(date)}</span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  date === today && "text-primary",
                )}
              >
                {Number(date.slice(8))}
              </span>
              {date === today && (
                <span className="text-primary text-xs">Today</span>
              )}
            </p>
            {items.length === 0 ? (
              <p className="text-muted-foreground text-xs">No Visits</p>
            ) : (
              <ul className="space-y-1.5">
                {items.map((item) => (
                  <li key={item.id}>
                    <CalendarEntry visit={item} timeZone={timeZone} />
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A Visit on a day, coloured by status: one line in a month cell, a small
 * card in a week. The words carry the status too, for screen readers.
 */
function CalendarEntry({
  visit,
  timeZone,
  compact = false,
}: {
  visit: VisitListItem;
  timeZone: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={visitPath(visit.id)}
      className={cn(
        "block min-w-0 rounded-md border hover:underline",
        STATUS_CLASSES[visit.status],
        compact ? "truncate px-1 py-0.5 text-xs" : "space-y-0.5 px-2 py-1.5",
        visit.status === "cancelled" && "line-through",
      )}
    >
      {compact ? (
        <>
          {visit.checkedIn && (
            <>
              <CheckedInMark compact />{" "}
            </>
          )}
          {`${visitTime(visit.visitAt, timeZone)} ${visit.prospectCompany.name}`}
          <span className="sr-only">{`, ${visit.number}, ${VISIT_STATUS_LABELS[visit.status]}`}</span>
        </>
      ) : (
        <>
          <span className="flex items-center justify-between gap-1 text-xs">
            <span className="font-medium tabular-nums">
              {visitTime(visit.visitAt, timeZone)}
            </span>
            <span>{visit.number}</span>
          </span>
          <span className="block truncate text-sm">
            {visit.prospectCompany.name}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 text-xs">
            {VISIT_STATUS_LABELS[visit.status]}
            {visit.checkedIn && <CheckedInMark />}
          </span>
        </>
      )}
    </Link>
  );
}

/** A Visit in the chosen day's list: time, number, company and people. */
function AgendaEntry({
  visit,
  timeZone,
}: {
  visit: VisitListItem;
  timeZone: string;
}) {
  return (
    <div
      className={cn(
        "bg-card flex min-w-0 items-start gap-3 rounded-lg border p-3",
        visit.status === "missed" && "border-red-300 dark:border-red-800",
      )}
    >
      <span className="w-16 shrink-0 text-sm font-medium tabular-nums">
        {visitTime(visit.visitAt, timeZone)}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Link
            href={visitPath(visit.id)}
            className="font-medium hover:underline"
          >
            {visit.number}
          </Link>
          <VisitStatusBadge status={visit.status} />
          {visit.checkedIn && <CheckedInMark />}
        </div>
        <p className="truncate text-sm">{visit.prospectCompany.name}</p>
        <p className="text-muted-foreground truncate text-xs">
          {`By ${visit.visitors.map((person) => person.name).join(", ") || "—"}`}
        </p>
      </div>
    </div>
  );
}
