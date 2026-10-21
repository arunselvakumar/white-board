"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { BookOpen, ChevronLeft, ChevronRight, PenLine } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useDeferredValue, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import { cn } from "@repo/ui/lib/utils";

import {
  formatDate,
  localToday,
} from "@/components/procurement/inventory/inventory-format";
import { addDays, isCalendarDate } from "@/src/shared-kernel/calendar-date";
import {
  siteDiaryDaysQuery,
  siteDiaryOnDateQuery,
  siteDiaryPath,
} from "@/src/queries/site-diary";
import {
  canInSiteWork,
  siteWorkAccessQuery,
} from "@/src/queries/site-work-access";

import {
  formatDayOfMonth,
  formatLongDate,
  formatMonth,
  monthRange,
  shiftMonth,
  WeatherIcon,
} from "./site-diary-parts";
import { SiteDiaryView } from "./site-diary-view";
import {
  DiaryDaySkeleton,
  DiaryMonthSkeleton,
} from "@/components/site-work/site-work-skeletons";

function DiaryForDate({
  projectId,
  date,
  canCreate,
  canAttach,
  className,
}: {
  projectId: string;
  date: string;
  canCreate: boolean;
  canAttach: boolean;
  className?: string;
}) {
  const { data } = useSuspenseQuery(siteDiaryOnDateQuery(projectId, date));
  if (data.diary == null)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <BookOpen />
          </EmptyMedia>
          <EmptyTitle>No diary for {formatDate(date)}</EmptyTitle>
          <EmptyDescription>
            Record the weather, visitors and instructions on site for the day.
          </EmptyDescription>
        </EmptyHeader>
        {canCreate && (
          <EmptyContent>
            <Link
              href={`${siteDiaryPath(projectId)}/new?date=${date}`}
              className={buttonVariants()}
            >
              <PenLine aria-hidden="true" />
              Write the diary
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );
  return (
    <div className={cn("min-w-0", className)}>
      <SiteDiaryView
        diary={data.diary}
        editHref={`${siteDiaryPath(projectId)}/${data.diary.id}/edit`}
        canAttach={canAttach}
      />
    </div>
  );
}

function MonthDays({
  projectId,
  month,
  selected,
  onSelect,
  className,
}: {
  projectId: string;
  month: string;
  selected: string;
  onSelect: (date: string) => void;
  className?: string;
}) {
  const { from, to } = monthRange(month);
  const { data } = useSuspenseQuery(siteDiaryDaysQuery(projectId, from, to));
  if (data.items.length === 0)
    return (
      <p className="text-muted-foreground px-1 text-sm">
        No diaries this month.
      </p>
    );
  return (
    <ul
      aria-label={`Diaries in ${formatMonth(month)}`}
      className={cn("space-y-1", className)}
    >
      {data.items.map((day) => (
        <li key={day.id}>
          <Button
            type="button"
            variant="ghost"
            aria-current={day.diaryDate === selected ? "date" : undefined}
            className={cn(
              "h-auto w-full justify-between gap-2 px-2 py-1.5 font-normal",
              day.diaryDate === selected && "bg-muted",
            )}
            onClick={() => {
              onSelect(day.diaryDate);
            }}
          >
            <span className="font-medium">
              {formatDayOfMonth(day.diaryDate)}
            </span>
            <span className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {day.weatherMorning != null && (
                <WeatherIcon weather={day.weatherMorning} className="size-4" />
              )}
              {day.weatherAfternoon != null && (
                <WeatherIcon
                  weather={day.weatherAfternoon}
                  className="size-4"
                />
              )}
              {day.visitorCount > 0 &&
                `${String(day.visitorCount)} ${day.visitorCount === 1 ? "visitor" : "visitors"}`}
            </span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Project's Site Diary module (CM-607, ADR CM-0016 §13): one diary per
 * date. It opens on today, steps a day back or forward (never past today),
 * lists the month's diaries beside it, and offers "Write the diary" on a
 * date without one to members with Create.
 */
export function SiteDiaryPage({
  projectId,
  initialDate,
}: {
  projectId: string;
  /** `YYYY-MM-DD` from `?date=`; today when missing, invalid or ahead. */
  initialDate?: string;
}) {
  const router = useRouter();
  const today = localToday();
  const start =
    initialDate != null && isCalendarDate(initialDate) && initialDate <= today
      ? initialDate
      : today;
  const [date, setDate] = useState(start);
  const [month, setMonth] = useState(start.slice(0, 7));
  const { data: access } = useSuspenseQuery(siteWorkAccessQuery(projectId));
  const canCreate = canInSiteWork(access, "site_work.site_diary", "create");
  const canAttach =
    canCreate || canInSiteWork(access, "site_work.site_diary", "update");

  const go = (next: string) => {
    if (!isCalendarDate(next)) return;
    const clamped = next > today ? today : next;
    setDate(clamped);
    setMonth(clamped.slice(0, 7));
    router.replace(siteDiaryPath(projectId, clamped), { scroll: false });
  };

  // A new day or month keeps the old one on screen, dimmed, until it loads.
  const shownDate = useDeferredValue(date);
  const shownMonth = useDeferredValue(month);

  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="font-semibold">Site Diary</h2>
          <p className="text-muted-foreground text-sm">
            {formatLongDate(date)}
          </p>
        </div>
        <div
          role="group"
          aria-label="Diary date"
          className="flex items-center gap-1"
        >
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Previous day"
            onClick={() => {
              go(addDays(date, -1));
            }}
          >
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Input
            type="date"
            aria-label="Date"
            className="h-8 w-40"
            max={today}
            value={date}
            onChange={(event) => {
              go(event.target.value);
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Next day"
            disabled={date >= today}
            onClick={() => {
              go(addDays(date, 1));
            }}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
          {date !== today && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                go(today);
              }}
            >
              Today
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <Suspense fallback={<DiaryDaySkeleton />}>
          <DiaryForDate
            projectId={projectId}
            date={shownDate}
            className={cn(
              shownDate !== date && "opacity-60 transition-opacity",
            )}
            canCreate={canCreate}
            canAttach={canAttach}
          />
        </Suspense>

        <aside aria-label="Diaries this month" className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Previous month"
              onClick={() => {
                setMonth(shiftMonth(month, -1));
              }}
            >
              <ChevronLeft aria-hidden="true" />
            </Button>
            <p className="text-sm font-medium">{formatMonth(month)}</p>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Next month"
              disabled={month >= today.slice(0, 7)}
              onClick={() => {
                setMonth(shiftMonth(month, 1));
              }}
            >
              <ChevronRight aria-hidden="true" />
            </Button>
          </div>
          <Suspense fallback={<DiaryMonthSkeleton />}>
            <MonthDays
              projectId={projectId}
              month={shownMonth}
              className={cn(
                shownMonth !== month && "opacity-60 transition-opacity",
              )}
              selected={date}
              onSelect={go}
            />
          </Suspense>
        </aside>
      </div>
    </div>
  );
}
