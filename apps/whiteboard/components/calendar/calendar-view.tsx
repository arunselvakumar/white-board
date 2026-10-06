"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CalendarDays,
  CalendarOff,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  MapPin,
  MonitorPlay,
} from "lucide-react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";

import {
  addDays,
  addMonths,
  dateKeyInZone,
  expandCalendarItems,
  formatDate,
  monthGrid,
  weekDates,
  type CalendarEvent,
  type DateKey,
} from "@/lib/calendar-dates";
import {
  classChangeSummary,
  classMarker,
  isOff,
  upcomingChanges,
} from "@/lib/class-changes";
import type {
  CalendarItem,
  CalendarPermissions,
  ClassChange,
  Holiday,
} from "@/src/queries/calendar";
import { classPath } from "@/src/queries/classes";
import { holidayOn } from "@/src/training-institute/domain/class-schedule";

import {
  ClassChangeDialog,
  type ClassChangeActions,
} from "./class-change-dialog";
import {
  HolidaysDialog,
  holidayRangeLabel,
  type HolidayActions,
} from "./holidays-dialog";

type ViewMode = "day" | "week" | "month";
type Event = CalendarEvent<CalendarItem>;

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const COLORS = [
  {
    chip: "bg-sky-100 text-sky-900 dark:bg-sky-900/70 dark:text-sky-100",
    card: "border-sky-500 bg-sky-100/90 text-sky-950 dark:bg-sky-950 dark:text-sky-100",
    dot: "bg-sky-500",
  },
  {
    chip: "bg-violet-100 text-violet-900 dark:bg-violet-900/70 dark:text-violet-100",
    card: "border-violet-500 bg-violet-100/90 text-violet-950 dark:bg-violet-950 dark:text-violet-100",
    dot: "bg-violet-500",
  },
  {
    chip: "bg-emerald-100 text-emerald-900 dark:bg-emerald-900/70 dark:text-emerald-100",
    card: "border-emerald-500 bg-emerald-100/90 text-emerald-950 dark:bg-emerald-950 dark:text-emerald-100",
    dot: "bg-emerald-500",
  },
  {
    chip: "bg-amber-100 text-amber-900 dark:bg-amber-900/70 dark:text-amber-100",
    card: "border-amber-500 bg-amber-100/90 text-amber-950 dark:bg-amber-950 dark:text-amber-100",
    dot: "bg-amber-500",
  },
  {
    chip: "bg-rose-100 text-rose-900 dark:bg-rose-900/70 dark:text-rose-100",
    card: "border-rose-500 bg-rose-100/90 text-rose-950 dark:bg-rose-950 dark:text-rose-100",
    dot: "bg-rose-500",
  },
  {
    chip: "bg-teal-100 text-teal-900 dark:bg-teal-900/70 dark:text-teal-100",
    card: "border-teal-500 bg-teal-100/90 text-teal-950 dark:bg-teal-950 dark:text-teal-100",
    dot: "bg-teal-500",
  },
] as const;

function colorFor(id: string) {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length] ?? COLORS[0];
}

function timeLabel(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const suffix = hour < 12 ? "AM" : "PM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function rangeLabel(
  mode: ViewMode,
  selected: DateKey,
  dates: DateKey[],
): string {
  if (mode === "day")
    return formatDate(selected, {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  if (mode === "month")
    return formatDate(selected, { month: "long", year: "numeric" });
  const first = dates[0] ?? selected;
  const last = dates[dates.length - 1] ?? selected;
  return `${formatDate(first, { month: "short", day: "numeric" })} – ${formatDate(last, { month: "short", day: "numeric", year: "numeric" })}`;
}

function eventLabel(event: Event): string {
  const { item } = event;
  const summary = classChangeSummary(event.scheduled);
  return `${item.courseName}, ${item.batchName}, ${timeLabel(event.startMinutes)} to ${timeLabel(event.endMinutes)}, ${item.classMode}${item.room ? `, ${item.room}` : ""}${item.studentName ? `, ${item.studentName}` : ""}${summary ? `, ${summary}` : ""}`;
}

function CalendarEventCard({
  event,
  compact = false,
  onSelect,
}: {
  event: Event;
  compact?: boolean;
  onSelect?: (event: Event) => void;
}) {
  const colors = colorFor(event.item.courseId);
  const href = classPath(
    event.item.batchId,
    event.date,
    event.scheduled.startTime,
  );
  const linked = event.item.classMode !== "offline";
  const off = isOff(event.scheduled);
  const marker = classMarker(event.scheduled);
  const offClass = off ? "opacity-60 saturate-50" : "";
  const titleClass = off ? "line-through decoration-2" : "";
  const label = eventLabel(event);
  if (compact) {
    const chip = (
      <>
        {timeLabel(event.startMinutes)} ·{" "}
        <span className={titleClass}>{event.item.courseName}</span>
        {event.item.studentName ? ` · ${event.item.studentName}` : ""}
        {marker ? ` · ${marker}` : ""}
      </>
    );
    const chipClass = `block w-full truncate rounded-md px-2 py-1 text-left text-xs font-medium ${colors.chip} ${offClass} ${event.scheduled.rescheduled ? "ring-1 ring-current ring-dashed" : ""}`;
    if (onSelect)
      return (
        <Button
          variant="ghost"
          title={label}
          aria-label={`Change ${label}`}
          className={`${chipClass} h-auto justify-start`}
          onClick={() => {
            onSelect(event);
          }}
        >
          <span className="truncate">{chip}</span>
        </Button>
      );
    return linked ? (
      <Link href={href} title={label} className={chipClass}>
        {chip}
      </Link>
    ) : (
      <div title={label} className={chipClass}>
        {chip}
      </div>
    );
  }
  const content = (
    <>
      <p className="truncate text-[11px] font-semibold opacity-75">
        {timeLabel(event.startMinutes)}–{timeLabel(event.endMinutes)}
      </p>
      <p className={`truncate text-xs font-bold sm:text-sm ${titleClass}`}>
        {event.item.courseName}
      </p>
      {marker && (
        <p className="truncate text-[11px] font-semibold tracking-wide uppercase">
          {marker}
          {event.scheduled.reason ? ` · ${event.scheduled.reason}` : ""}
        </p>
      )}
      <p className="truncate text-[11px] font-medium">{event.item.batchName}</p>
      {event.item.studentName && (
        <p className="truncate text-[11px] opacity-75">
          {event.item.studentName}
        </p>
      )}
      <p className="mt-1 flex items-center gap-1 truncate text-[11px] capitalize opacity-75">
        {event.item.room ? (
          <MapPin className="size-3 shrink-0" />
        ) : (
          <MonitorPlay className="size-3 shrink-0" />
        )}
        {event.item.classMode}
        {event.item.room ? ` · ${event.item.room}` : ""}
      </p>
    </>
  );
  const className = `block h-full overflow-hidden rounded-r-lg border-l-4 px-2.5 py-1.5 shadow-sm ${colors.card} ${offClass} ${event.scheduled.rescheduled ? "border-dashed" : ""}`;
  if (onSelect)
    return (
      <Button
        variant="ghost"
        aria-label={`Change ${label}`}
        title={label}
        className={`${className} h-full w-full flex-col items-stretch justify-start gap-0 rounded-l-none text-left font-normal whitespace-normal`}
        onClick={() => {
          onSelect(event);
        }}
      >
        {content}
      </Button>
    );
  return linked ? (
    <Link
      href={href}
      aria-label={`Open ${label}`}
      title={label}
      className={className}
    >
      {content}
    </Link>
  ) : (
    <div aria-label={label} title={label} className={className}>
      {content}
    </div>
  );
}

function HolidayLabel({ holiday }: { holiday: Holiday | null }) {
  if (holiday == null) return null;
  return (
    <p className="mx-auto mt-1 flex max-w-full items-center justify-center gap-1 truncate text-[11px] font-semibold text-rose-700 dark:text-rose-300">
      <CalendarOff className="size-3 shrink-0" />
      <span className="truncate">
        Holiday{holiday.reason ? ` · ${holiday.reason}` : ""}
      </span>
    </p>
  );
}

function layoutDay(
  events: Event[],
): { event: Event; lane: number; lanes: number }[] {
  const sorted = [...events].sort(
    (a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes,
  );
  const groups: Event[][] = [];
  let groupEnd = -1;
  for (const event of sorted) {
    if (event.startMinutes >= groupEnd) {
      groups.push([]);
      groupEnd = -1;
    }
    const group = groups.at(-1);
    if (group) group.push(event);
    groupEnd = Math.max(groupEnd, event.endMinutes);
  }
  return groups.flatMap((group) => {
    const laneEnds: number[] = [];
    const placed = group.map((event) => {
      let lane = laneEnds.findIndex((end) => end <= event.startMinutes);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = event.endMinutes;
      return { event, lane };
    });
    return placed.map((entry) => ({ ...entry, lanes: laneEnds.length }));
  });
}

function TimeGrid({
  dates,
  events,
  today,
  holidays,
  onSelect,
}: {
  dates: DateKey[];
  events: Event[];
  today: DateKey;
  holidays: Holiday[];
  onSelect?: (event: Event) => void;
}) {
  const earliest = events.length
    ? Math.min(...events.map((event) => event.startMinutes))
    : 8 * 60;
  const latest = events.length
    ? Math.max(...events.map((event) => event.endMinutes))
    : 18 * 60;
  const firstHour = Math.max(0, Math.min(8, Math.floor(earliest / 60) - 1));
  const lastHour = Math.min(24, Math.max(18, Math.ceil(latest / 60) + 1));
  const height = (lastHour - firstHour) * 64;
  return (
    <div className="bg-card overflow-x-auto rounded-2xl border shadow-sm">
      <div style={{ minWidth: dates.length === 1 ? 420 : 1050 }}>
        <div
          className="bg-muted/40 grid border-b"
          style={{
            gridTemplateColumns: `64px repeat(${dates.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="border-r" />
          {dates.map((date) => (
            <div
              key={date}
              className={`border-r px-3 py-3 text-center last:border-r-0 ${date === today ? "bg-primary/5" : ""}`}
            >
              <p className="text-muted-foreground text-[11px] font-semibold tracking-wide uppercase">
                {formatDate(date, { weekday: "short" })}
              </p>
              <p
                className={`mx-auto mt-1 flex size-9 items-center justify-center rounded-full text-lg font-semibold ${date === today ? "bg-primary text-primary-foreground" : ""}`}
              >
                {Number(date.slice(-2))}
              </p>
              <HolidayLabel holiday={holidayOn(holidays, date)} />
            </div>
          ))}
        </div>
        <div
          className="grid"
          style={{
            gridTemplateColumns: `64px repeat(${dates.length}, minmax(0, 1fr))`,
          }}
        >
          <div className="relative border-r" style={{ height }}>
            {Array.from({ length: lastHour - firstHour }, (_, index) => (
              <span
                key={index}
                className="text-muted-foreground absolute right-2 -translate-y-2 text-[11px]"
                style={{ top: index * 64 }}
              >
                {timeLabel((firstHour + index) * 60)}
              </span>
            ))}
          </div>
          {dates.map((date) => (
            <div
              key={date}
              className={`relative border-r last:border-r-0 ${date === today ? "bg-primary/[0.025]" : ""}`}
              style={{
                height,
                backgroundImage:
                  "linear-gradient(to bottom, var(--border) 1px, transparent 1px)",
                backgroundSize: "100% 64px",
              }}
            >
              {layoutDay(events.filter((event) => event.date === date)).map(
                ({ event, lane, lanes }) => (
                  <div
                    key={event.id}
                    className="absolute z-10 px-0.5"
                    style={{
                      top:
                        ((event.startMinutes - firstHour * 60) / 60) * 64 + 2,
                      height: Math.max(
                        32,
                        ((event.endMinutes - event.startMinutes) / 60) * 64 - 4,
                      ),
                      left: `${(lane / lanes) * 100}%`,
                      width: `${100 / lanes}%`,
                    }}
                  >
                    <CalendarEventCard event={event} onSelect={onSelect} />
                  </div>
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MonthGrid({
  dates,
  events,
  selected,
  today,
  holidays,
  onSelect,
}: {
  dates: DateKey[];
  events: Event[];
  selected: DateKey;
  today: DateKey;
  holidays: Holiday[];
  onSelect?: (event: Event) => void;
}) {
  return (
    <div className="bg-card overflow-x-auto rounded-2xl border shadow-sm">
      <div className="min-w-[770px]">
        <div className="bg-muted/40 grid grid-cols-7 border-b">
          {DAYS.map((day) => (
            <div
              key={day}
              className="text-muted-foreground border-r px-3 py-3 text-center text-xs font-semibold last:border-r-0"
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dates.map((date) => {
            const dayEvents = events.filter((event) => event.date === date);
            return (
              <div
                key={date}
                className={`min-h-32 space-y-1 border-r border-b p-2 last:border-r-0 ${date.slice(0, 7) !== selected.slice(0, 7) ? "bg-muted/35 text-muted-foreground" : ""} ${date === today ? "bg-primary/5" : ""}`}
              >
                <span
                  className={`flex size-7 items-center justify-center rounded-full text-xs font-semibold ${date === today ? "bg-primary text-primary-foreground" : ""}`}
                >
                  {Number(date.slice(-2))}
                </span>
                <HolidayLabel holiday={holidayOn(holidays, date)} />
                {dayEvents.slice(0, 3).map((event) => (
                  <CalendarEventCard
                    key={event.id}
                    event={event}
                    compact
                    onSelect={onSelect}
                  />
                ))}
                {dayEvents.length > 3 && (
                  <p className="px-1 text-[11px] font-semibold">
                    +{dayEvents.length - 3} more
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

const NO_PERMISSIONS: CalendarPermissions = {
  changeClasses: false,
  manageHolidays: false,
};

function UpcomingChanges({
  changes,
}: {
  changes: ReturnType<typeof upcomingChanges<CalendarItem>>;
}) {
  if (changes.length === 0) return null;
  return (
    <section
      aria-labelledby="upcoming-changes"
      className="bg-card rounded-2xl border p-4 shadow-sm sm:p-5"
    >
      <h2
        id="upcoming-changes"
        className="flex items-center gap-2 text-sm font-semibold"
      >
        <CalendarOff className="size-4 text-rose-600" /> Upcoming changes
        <span className="text-muted-foreground font-normal">
          · next 14 days
        </span>
      </h2>
      <ul className="mt-3 divide-y">
        {changes.map((change) => (
          <li
            key={change.id}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm"
          >
            <span className="w-28 shrink-0 font-medium">
              {formatDate(change.date, {
                weekday: "short",
                month: "short",
                day: "numeric",
              })}
            </span>
            {change.kind === "holiday" ? (
              <span className="min-w-0 flex-1">
                <Badge variant="destructive">Holiday</Badge>{" "}
                {holidayRangeLabel(change)}
                {change.reason ? ` · ${change.reason}` : ""}
              </span>
            ) : (
              <span className="min-w-0 flex-1">
                <Badge
                  variant={
                    change.event.scheduled.status === "scheduled"
                      ? "secondary"
                      : "destructive"
                  }
                >
                  {classMarker(change.event.scheduled)}
                </Badge>{" "}
                <span className="font-medium">
                  {change.event.item.courseName}
                </span>{" "}
                · {change.event.item.batchName}
                {change.event.item.studentName
                  ? ` · ${change.event.item.studentName}`
                  : ""}{" "}
                · {timeLabel(change.event.startMinutes)}
                <span className="text-muted-foreground block text-xs">
                  {change.summary}
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CalendarView({
  items,
  classChanges = [],
  holidays = [],
  permissions = NO_PERMISSIONS,
  classActions,
  holidayActions,
}: {
  items: CalendarItem[];
  classChanges?: ClassChange[];
  holidays?: Holiday[];
  permissions?: CalendarPermissions;
  classActions?: ClassChangeActions;
  holidayActions?: HolidayActions;
}) {
  const timezone = items[0]?.timezone ?? "Asia/Kolkata";
  const today = dateKeyInZone(new Date(), timezone);
  const [selected, setSelected] = useState<DateKey>(today);
  const [mode, setMode] = useState<ViewMode>("week");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [holidaysOpen, setHolidaysOpen] = useState(false);
  const exceptions = { classChanges, holidays };
  const dates =
    mode === "day"
      ? [selected]
      : mode === "week"
        ? weekDates(selected)
        : monthGrid(selected);
  const events = expandCalendarItems(items, dates, exceptions);
  const happening = events.filter((event) => !isOff(event.scheduled));
  const changes = upcomingChanges(
    expandCalendarItems(
      items,
      Array.from({ length: 14 }, (_, index) => addDays(today, index)),
      exceptions,
    ),
    holidays,
    today,
  );
  const onSelect =
    permissions.changeClasses && classActions != null
      ? setSelectedEvent
      : undefined;
  const courses = new Map(
    items.map((item) => [item.courseId, item.courseName]),
  );
  const move = (direction: -1 | 1) => {
    setSelected((date) =>
      mode === "month"
        ? addMonths(date, direction)
        : addDays(date, direction * (mode === "week" ? 7 : 1)),
    );
  };

  return (
    <main className="w-full space-y-6 p-4 sm:p-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#172554] via-[#3730a3] to-[#0f766e] px-6 py-7 text-white shadow-lg sm:px-8">
        <div className="pointer-events-none absolute -top-14 -right-8 size-56 rounded-full border border-white/20" />
        <div className="pointer-events-none absolute top-10 right-20 size-28 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
              <CalendarDays className="size-4" /> Schedule
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
              Calendar
            </h1>
            <p className="mt-2 text-sm text-white/75">
              Your Classes, all in one place.
            </p>
          </div>
          <div className="rounded-xl border border-white/20 bg-white/10 px-4 py-3 backdrop-blur-sm">
            <p className="text-2xl font-semibold">{happening.length}</p>
            <p className="text-xs text-white/75">
              {mode === "day"
                ? "Classes today"
                : mode === "week"
                  ? "Classes this week"
                  : "Classes this month"}
            </p>
          </div>
        </div>
      </div>

      <UpcomingChanges changes={changes} />

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            aria-label="Previous"
            onClick={() => {
              move(-1);
            }}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setSelected(today);
            }}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Next"
            onClick={() => {
              move(1);
            }}
          >
            <ChevronRight className="size-4" />
          </Button>
          <h2 className="ml-2 text-lg font-semibold tracking-tight sm:text-xl">
            {rangeLabel(mode, selected, dates)}
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {permissions.manageHolidays && holidayActions && (
            <Button
              variant="outline"
              onClick={() => {
                setHolidaysOpen(true);
              }}
            >
              <CalendarOff className="size-4" /> Holidays
            </Button>
          )}
          <div
            className="border-border/70 bg-secondary/70 flex rounded-xl border p-1"
            aria-label="Calendar view"
          >
            {(["day", "week", "month"] as const).map((view) => (
              <Button
                key={view}
                size="sm"
                variant="ghost"
                aria-pressed={mode === view}
                onClick={() => {
                  setMode(view);
                }}
                className={`min-w-20 rounded-lg border px-3 font-semibold transition-all ${mode === view ? "border-border/70 bg-card text-primary hover:bg-card shadow-sm" : "text-muted-foreground hover:bg-card/70 hover:text-foreground border-transparent"}`}
              >
                {mode === view && (
                  <CheckCircle2
                    aria-hidden="true"
                    className="fill-primary text-primary-foreground size-4"
                  />
                )}
                {view[0]?.toUpperCase()}
                {view.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {[...courses].map(([id, name]) => (
            <span key={id} className="flex items-center gap-1.5">
              <span className={`size-2.5 rounded-full ${colorFor(id).dot}`} />
              {name}
            </span>
          ))}
        </div>
        <p className="flex items-center gap-1.5">
          <Clock3 className="size-3.5" />{" "}
          {items.length
            ? `Times shown in each Batch’s timezone${new Set(items.map((item) => item.timezone)).size === 1 ? ` · ${timezone}` : ""}`
            : "Weekly Batch Timings"}
        </p>
      </div>

      {items.length === 0 ? (
        <div className="bg-card flex min-h-96 flex-col items-center justify-center rounded-2xl border border-dashed px-6 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-200">
            <CalendarDays className="size-8" />
          </div>
          <h2 className="text-xl font-semibold">No Batch Timings to show</h2>
          <p className="text-muted-foreground mt-2 max-w-md text-sm">
            Scheduled Batches will appear here when they are available to you.
          </p>
        </div>
      ) : mode === "month" ? (
        <MonthGrid
          dates={dates}
          events={events}
          selected={selected}
          today={today}
          holidays={holidays}
          onSelect={onSelect}
        />
      ) : (
        <TimeGrid
          dates={dates}
          events={events}
          today={today}
          holidays={holidays}
          onSelect={onSelect}
        />
      )}

      {items.length > 0 && (
        <p className="text-muted-foreground flex items-center gap-2 text-xs">
          <MonitorPlay className="size-3.5" />
          Timings repeat weekly. Cancelled, Moved, and Holiday Classes are
          marked{onSelect ? "; select a Class to change it" : ""}.
        </p>
      )}

      <ClassChangeDialog
        key={selectedEvent?.id ?? "none"}
        event={selectedEvent}
        canChange={permissions.changeClasses}
        actions={classActions}
        onClose={() => {
          setSelectedEvent(null);
        }}
      />
      {permissions.manageHolidays && holidayActions && (
        <HolidaysDialog
          open={holidaysOpen}
          onOpenChange={setHolidaysOpen}
          holidays={holidays}
          today={today}
          actions={holidayActions}
        />
      )}
    </main>
  );
}
