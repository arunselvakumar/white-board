"use client";

import {
  QueryErrorResetBoundary,
  useSuspenseInfiniteQuery,
} from "@tanstack/react-query";
import { CalendarDotsIcon, WarningCircleIcon } from "@phosphor-icons/react/ssr";
import {
  Building2,
  CalendarCheck,
  CalendarX,
  ChevronLeft,
  ChevronRight,
  Clock,
  Timer,
  Users,
} from "lucide-react";
import { parseAsString, useQueryState } from "nuqs";
import { Component, Suspense, useEffect, useMemo, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";
import { EmptyState } from "@repo/ui/components/empty-state";
import { MetricCard } from "@repo/ui/components/metric-card";
import {
  MetricGridSkeleton,
  SkeletonGroup,
  SkeletonText,
} from "@repo/ui/components/skeleton-kit";

import { FormAlert } from "@/components/auth/form-alert";
import type {
  PersonAttendanceAllTime,
  PersonAttendanceQuery,
} from "@/src/queries/person-attendance";

import { AttendanceCalendar, type CalendarMonth } from "./attendance-calendar";
import {
  countFigure,
  formatLongDate,
  formatMonth,
  hoursFigure,
  monthFigures,
  type MonthFigures,
} from "./attendance-summary";

/**
 * A person's Attendance tab (ADR CM-0051): the picked month's cards, the
 * all-time line and the calendar. The same on an Employee's, a Vendor's
 * and an Office Staff member's page; the query says
 * whose. The month is kept in the address (`?month=YYYY-MM`).
 */
export function PersonAttendance({
  query,
  emptyMessage,
}: {
  query: PersonAttendanceQuery;
  /** Said when the person has no attendance at all. */
  emptyMessage: string;
}) {
  return (
    <AttendanceBoundary>
      <PersonAttendanceBody query={query} emptyMessage={emptyMessage} />
    </AttendanceBoundary>
  );
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

function shiftMonth(month: string, by: number): string {
  const [y = 1970, m = 1] = month.split("-").map(Number);
  const index = y * 12 + m - 1 + by;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function PersonAttendanceBody({
  query,
  emptyMessage,
}: {
  query: PersonAttendanceQuery;
  emptyMessage: string;
}) {
  const result = useSuspenseInfiniteQuery(query);
  const pages = result.data.pages;
  const first = pages[0];
  const [picked, setPicked] = useQueryState("month", parseAsString);

  // Pages come newest first, each oldest first inside.
  const months = useMemo<CalendarMonth[]>(
    () => [...pages].reverse().flatMap((page) => page.months),
    [pages],
  );
  const today = first?.today ?? "";
  const thisMonth = today.slice(0, 7);
  const firstMonth = first?.firstMonth ?? thisMonth;
  const selected =
    picked != null &&
    MONTH_RE.test(picked) &&
    picked >= firstMonth &&
    picked <= thisMonth
      ? picked
      : thisMonth;
  const loaded = months.find((month) => month.month === selected);

  const {
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  } = result;
  // A month picked further back than loaded: load pages until it is. After
  // a failed page it stops; "Earlier" on the calendar tries again.
  useEffect(() => {
    if (
      loaded == null &&
      hasNextPage &&
      !isFetchingNextPage &&
      !isFetchNextPageError
    )
      void fetchNextPage();
  }, [
    loaded,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
    fetchNextPage,
  ]);

  if (first == null) return null;
  const allTime = first.allTime;
  const nothingAtAll =
    allTime != null &&
    allTime.firstDay == null &&
    months.every((month) => month.days.length === 0);

  function select(month: string) {
    void setPicked(month === thisMonth ? null : month);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Previous month"
            disabled={selected <= firstMonth}
            onClick={() => {
              select(shiftMonth(selected, -1));
            }}
          >
            <ChevronLeft />
          </Button>
          <h2
            className="min-w-36 text-center text-base font-semibold"
            aria-live="polite"
          >
            {formatMonth(selected, "long")}
          </h2>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Next month"
            disabled={selected >= thisMonth}
            onClick={() => {
              select(shiftMonth(selected, 1));
            }}
          >
            <ChevronRight />
          </Button>
          {selected === thisMonth ? null : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                select(thisMonth);
              }}
            >
              This month
            </Button>
          )}
        </div>
        {allTime == null ? null : (
          <AllTimeLine
            allTime={allTime}
            firstMonth={firstMonth}
            measure={first.measure}
          />
        )}
      </div>

      {nothingAtAll ? (
        <EmptyState
          icon={CalendarDotsIcon}
          title="No attendance yet"
          description={emptyMessage}
          className="border"
        />
      ) : loaded == null ? (
        <CardsSkeleton />
      ) : (
        <MonthCards
          figures={monthFigures(loaded.days)}
          measure={first.measure}
          recordsAbsence={first.recordsAbsence}
        />
      )}

      {result.isFetchNextPageError ? (
        <FormAlert message="Couldn't load earlier months. Please try again." />
      ) : null}

      <AttendanceCalendar
        months={months}
        measure={first.measure}
        recordsAbsence={first.recordsAbsence}
        today={today}
        selectedMonth={selected}
        onSelectMonth={select}
        hasEarlier={hasNextPage}
        loadingEarlier={isFetchingNextPage}
        onLoadEarlier={() => {
          void fetchNextPage();
        }}
      />
    </div>
  );
}

function AllTimeLine({
  allTime,
  firstMonth,
  measure,
}: {
  allTime: PersonAttendanceAllTime;
  firstMonth: string;
  measure: "hours" | "head_days";
}) {
  const parts = [
    `${countFigure(allTime.daysWorked)} ${measure === "head_days" ? "days supplied" : "days worked"}`,
    measure === "head_days"
      ? `${countFigure(allTime.headDays)} head-days`
      : `${hoursFigure(allTime.workedMinutes)} h`,
    `${String(allTime.places)} ${allTime.places === 1 ? "place" : "places"}`,
  ];
  return (
    <p className="text-muted-foreground text-sm">
      <span className="text-foreground font-medium">
        All time since {formatMonth(firstMonth)}:
      </span>{" "}
      {parts.join(" · ")}
      {allTime.lastDay == null
        ? null
        : ` · last ${measure === "head_days" ? "supplied" : "worked"} ${formatLongDate(allTime.lastDay)}`}
    </p>
  );
}

function placeCaption(figures: MonthFigures): string {
  if (figures.places.length === 0) return "None this month";
  const names = figures.places.slice(0, 2).map((place) => place.name);
  const more = figures.places.length - names.length;
  return more > 0
    ? `${names.join(", ")} and ${String(more)} more`
    : names.join(", ");
}

/** One row of cards on a wide screen, however many the person has. */
const WIDE_COLUMNS: Record<number, string> = {
  3: "xl:grid-cols-3",
  4: "xl:grid-cols-4",
  5: "xl:grid-cols-5",
};

function MonthCards({
  figures,
  measure,
  recordsAbsence,
}: {
  figures: MonthFigures;
  measure: "hours" | "head_days";
  recordsAbsence: boolean;
}) {
  const cards: ReactNode[] =
    measure === "head_days"
      ? [
          <MetricCard
            key="days"
            label="Days supplied"
            icon={CalendarCheck}
            value={countFigure(figures.daysWorked)}
            caption="Days with a headcount"
          />,
          <MetricCard
            key="head-days"
            label="Head-days"
            icon={Users}
            value={countFigure(figures.headDays)}
            caption={`Most heads in a day: ${String(figures.peakHeads)}`}
          />,
          <MetricCard
            key="overtime"
            label="Overtime"
            icon={Timer}
            value={hoursFigure(figures.overtimeMinutes)}
            unit=" h"
            caption="All heads together"
          />,
          <MetricCard
            key="places"
            label="Projects supplied"
            icon={Building2}
            value={figures.places.length}
            caption={placeCaption(figures)}
          />,
        ]
      : [
          <MetricCard
            key="days"
            label="Days worked"
            icon={CalendarCheck}
            value={countFigure(figures.daysWorked)}
            caption={
              recordsAbsence
                ? `${String(figures.fullDays)} full · ${String(figures.halfDays)} half`
                : "Days with a Check In"
            }
          />,
          <MetricCard
            key="hours"
            label="Hours worked"
            icon={Clock}
            value={hoursFigure(figures.workedMinutes)}
            unit=" h"
            caption={
              figures.averageMinutes == null
                ? "No days worked"
                : `${hoursFigure(figures.averageMinutes)} h a day on average`
            }
          />,
          ...(recordsAbsence
            ? [
                <MetricCard
                  key="overtime"
                  label="Overtime"
                  icon={Timer}
                  value={hoursFigure(figures.overtimeMinutes)}
                  unit=" h"
                  caption="Beyond working hours"
                />,
                <MetricCard
                  key="absent"
                  label="Absent & leave"
                  icon={CalendarX}
                  value={figures.absent + figures.leave + figures.paidLeave}
                  caption={`${String(figures.absent)} absent · ${String(figures.leave + figures.paidLeave)} leave${figures.paidLeave > 0 ? ` (${String(figures.paidLeave)} paid)` : ""}`}
                />,
              ]
            : []),
          <MetricCard
            key="places"
            label={
              figures.places.some((place) => place.kind === "branch")
                ? "Places worked at"
                : "Projects worked at"
            }
            icon={Building2}
            value={figures.places.length}
            caption={placeCaption(figures)}
          />,
        ];
  return (
    <ul
      aria-label="This month in figures"
      className={cn(
        "grid grid-cols-2 gap-3 md:grid-cols-3",
        WIDE_COLUMNS[cards.length],
      )}
    >
      {cards.map((card, i) => (
        <li key={i} className="flex min-w-0 [&>*]:w-full">
          {card}
        </li>
      ))}
    </ul>
  );
}

function CardsSkeleton() {
  return <MetricGridSkeleton count={5} label="Loading the month" />;
}

/** The tab's skeleton while its first page loads. */
export function PersonAttendanceSkeleton() {
  return (
    <SkeletonGroup label="Loading attendance" className="space-y-6">
      <SkeletonText size="lg" width="16rem" />
      <MetricGridSkeleton count={5} />
      <div className="flex gap-5 overflow-hidden" aria-hidden="true">
        {Array.from({ length: 4 }, (_, i) => (
          <div
            key={i}
            className="bg-muted h-56 w-60 shrink-0 rounded-xl motion-safe:animate-pulse"
          />
        ))}
      </div>
    </SkeletonGroup>
  );
}

type BoundaryProps = { children: ReactNode; onReset: () => void };

class ErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <EmptyState
        icon={WarningCircleIcon}
        tone="danger"
        orbit={false}
        title="Couldn't load the attendance"
        description="Please try again."
        className="border"
        actions={
          <Button
            type="button"
            onClick={() => {
              this.props.onReset();
              this.setState({ failed: false });
            }}
          >
            Try again
          </Button>
        }
      />
    );
  }
}

function AttendanceBoundary({ children }: { children: ReactNode }) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary onReset={reset}>
          <Suspense fallback={<PersonAttendanceSkeleton />}>
            {children}
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}
