"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Suspense, useState, useTransition } from "react";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { cn } from "@repo/ui/lib/utils";

import { dayLabel } from "@/app/(app)/preschool/family/_components/family-format";
import { formatClockTime } from "@/app/(app)/preschool/_components/preschool-format";
import { FamilyPage } from "@/app/(app)/preschool/family/_components/family-page";
import type { MeChildView } from "@/src/preschool/application/me";
import { addMonths, todayInIndia } from "@/src/preschool/domain/dates";
import {
  PRESCHOOL_ATTENDANCE_STATUS_LABELS,
  PRESCHOOL_COLLECTED_BY_LABELS,
  preschoolChildAttendanceQueryOptions,
  type PreschoolAttendanceStatus,
  type PreschoolChildAttendanceMonth,
} from "@/src/queries/preschool/attendance";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"] as const;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

const DAY_TONE: Record<PreschoolAttendanceStatus, string> = {
  present:
    "bg-emerald-100 text-emerald-900 dark:bg-emerald-400/20 dark:text-emerald-100",
  absent: "bg-red-100 text-red-900 dark:bg-red-400/20 dark:text-red-100",
  leave: "bg-amber-100 text-amber-900 dark:bg-amber-400/20 dark:text-amber-100",
};

/** "November 2026" */
function monthLabel(month: string): string {
  return new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

type Day = PreschoolChildAttendanceMonth["days"][number];

function DayDetail({ day, firstName }: { day: Day; firstName: string }) {
  return (
    <div
      role="status"
      className="bg-muted/40 space-y-1 rounded-xl border p-3 text-sm"
    >
      <p className="font-medium">{dayLabel(day.date)}</p>
      {day.status == null ? (
        <p className="text-muted-foreground">Not marked.</p>
      ) : (
        <>
          <p>{PRESCHOOL_ATTENDANCE_STATUS_LABELS[day.status]}</p>
          {day.checkInTime == null ? null : (
            <p>Checked in {formatClockTime(day.checkInTime)}</p>
          )}
          {day.checkOutTime == null ? null : (
            <p>
              Collected {formatClockTime(day.checkOutTime)}
              {day.collectedByName == null
                ? ""
                : ` by ${day.collectedByName}${
                    day.collectedByKind == null ||
                    day.collectedByKind === "other"
                      ? ""
                      : ` (${PRESCHOOL_COLLECTED_BY_LABELS[day.collectedByKind]})`
                  }`}
            </p>
          )}
          {day.status === "present" && day.checkInTime == null ? (
            <p className="text-muted-foreground">{firstName} was at school.</p>
          ) : null}
        </>
      )}
    </div>
  );
}

function Calendar({ child, month }: { child: MeChildView; month: string }) {
  const { data } = useSuspenseQuery(
    preschoolChildAttendanceQueryOptions(child.id, month),
  );
  const [selected, setSelected] = useState<string | null>(null);
  const first = data.days[0]?.date ?? `${month}-01`;
  const lead = new Date(`${first}T00:00:00Z`).getUTCDay();
  const picked = data.days.find((day) => day.date === selected) ?? null;

  return (
    <div className="space-y-4">
      <dl
        aria-label="Month totals"
        className="grid grid-cols-3 gap-2 text-center"
      >
        {(["present", "absent", "leave"] as const).map((status) => (
          <div key={status} className={cn("rounded-xl p-2", DAY_TONE[status])}>
            <dt className="text-xs">
              {PRESCHOOL_ATTENDANCE_STATUS_LABELS[status]}
            </dt>
            <dd className="text-xl font-semibold tabular-nums">
              {data.totals[status]}
            </dd>
          </div>
        ))}
      </dl>
      <div
        role="grid"
        aria-label={`${child.firstName}'s attendance, ${monthLabel(month)}`}
        className="space-y-1"
      >
        <div role="row" className="grid grid-cols-7 gap-1">
          {WEEKDAYS.map((letter, index) => (
            <span
              key={WEEKDAY_NAMES[index]}
              role="columnheader"
              aria-label={WEEKDAY_NAMES[index]}
              className="text-muted-foreground text-center text-xs font-medium"
            >
              {letter}
            </span>
          ))}
        </div>
        <div role="row" className="grid grid-cols-7 gap-1">
          {Array.from({ length: lead }, (_, index) => (
            <span key={`lead-${String(index)}`} role="gridcell" />
          ))}
          {data.days.map((day) => (
            <span key={day.date} role="gridcell">
              <Button
                type="button"
                variant="ghost"
                aria-label={`${dayLabel(day.date)}: ${
                  day.status == null
                    ? "not marked"
                    : PRESCHOOL_ATTENDANCE_STATUS_LABELS[day.status]
                }`}
                aria-pressed={selected === day.date}
                className={cn(
                  "h-11 w-full rounded-lg p-0 text-sm tabular-nums",
                  day.status == null
                    ? "text-muted-foreground"
                    : DAY_TONE[day.status],
                  selected === day.date && "ring-primary ring-2",
                )}
                onClick={() => {
                  setSelected(day.date === selected ? null : day.date);
                }}
              >
                {Number(day.date.slice(8))}
              </Button>
            </span>
          ))}
        </div>
      </div>
      <ul
        aria-label="Legend"
        className="text-muted-foreground flex flex-wrap gap-3 text-xs"
      >
        {(["present", "absent", "leave"] as const).map((status) => (
          <li key={status} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn("size-3 rounded", DAY_TONE[status])}
            />
            {PRESCHOOL_ATTENDANCE_STATUS_LABELS[status]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden="true" className="bg-muted size-3 rounded" />
          Not marked or no school
        </li>
      </ul>
      {picked == null ? (
        <p className="text-muted-foreground text-sm">
          Tap a day to see when {child.firstName} came and left.
        </p>
      ) : (
        <DayDetail day={picked} firstName={child.firstName} />
      )}
    </div>
  );
}

function MonthCalendar({ child }: { child: MeChildView }) {
  const current = todayInIndia(new Date()).slice(0, 7);
  const [month, setMonth] = useState(current);
  const [, startTransition] = useTransition();
  const shift = (by: number) => {
    startTransition(() => {
      setMonth(addMonths(`${month}-01`, by).slice(0, 7));
    });
  };
  return (
    <div className="space-y-4">
      <div
        role="group"
        aria-label="Month"
        className="flex items-center justify-between gap-2"
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Previous month"
          onClick={() => {
            shift(-1);
          }}
        >
          <ChevronLeft aria-hidden="true" />
        </Button>
        <p aria-live="polite" className="font-medium">
          {monthLabel(month)}
        </p>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-11"
          aria-label="Next month"
          disabled={month >= current}
          onClick={() => {
            shift(1);
          }}
        >
          <ChevronRight aria-hidden="true" />
        </Button>
      </div>
      <Suspense fallback={<Skeleton className="h-80 w-full rounded-xl" />}>
        <Calendar key={month} child={child} month={month} />
      </Suspense>
    </div>
  );
}

/** A Child's attendance as a month calendar (Parent). */
export function FamilyAttendanceScreen() {
  return (
    <FamilyPage title={(child) => `${child.firstName}'s attendance`}>
      {(child) => (
        <div className="w-full max-w-md">
          <MonthCalendar key={child.id} child={child} />
        </div>
      )}
    </FamilyPage>
  );
}
