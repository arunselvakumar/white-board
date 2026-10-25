"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  HardHat,
  Timer,
} from "lucide-react";
import Link from "next/link";
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
import { Label } from "@repo/ui/components/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";

import { formatPaise } from "@/components/money/money-input";
import { vendorAttendanceDayQuery } from "@/src/queries/vendor-attendance";

import { VENDOR_MASTERS_PATH, VendorDayCard } from "./vendor-day-card";
import { VendorMonthView } from "./vendor-month-view";
import { VendorOvertimeView } from "./vendor-overtime-view";
import { VendorDayGridSkeleton } from "@/components/attendance/attendance-skeletons";

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function shiftDate(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

function NoVendors() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <HardHat />
        </EmptyMedia>
        <EmptyTitle>No vendors on this Project</EmptyTitle>
        <EmptyDescription>
          Assign a vendor to this Project in Masters → Vendors, with a rate card
          of shifts and Labour Category rates, to record its headcount.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href={VENDOR_MASTERS_PATH} className={buttonVariants()}>
          Go to Vendors
        </Link>
      </EmptyContent>
    </Empty>
  );
}

function DayGrid({ projectId, date }: { projectId: string; date: string }) {
  const { data } = useSuspenseQuery(vendorAttendanceDayQuery(projectId, date));
  // The previous day, for "Copy yesterday"; the grid does not wait for it.
  const yesterday = useQuery(
    vendorAttendanceDayQuery(projectId, shiftDate(date, -1)),
  );
  if (data.vendors.length === 0) return <NoVendors />;
  const previous = new Map(
    (yesterday.data?.vendors ?? []).map((row) => [
      row.vendorId,
      row.attendance,
    ]),
  );
  return (
    <div className="space-y-4">
      {data.totalPay == null ? null : (
        <p className="text-muted-foreground text-sm">
          All vendors this day:{" "}
          <span className="text-foreground font-semibold tabular-nums">
            {formatPaise(data.totalPay)}
          </span>
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {data.vendors.map((row) => (
          <VendorDayCard
            key={`${row.vendorId}:${date}`}
            projectId={projectId}
            date={date}
            row={row}
            yesterday={previous.get(row.vendorId) ?? null}
          />
        ))}
      </div>
    </div>
  );
}

function DayTab({
  projectId,
  initialDate,
}: {
  projectId: string;
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  // The last day's cards stay on screen, dimmed, while the next day loads.
  const shownDate = useDeferredValue(date);
  const today = localToday();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="vendor-attendance-date">Date</Label>
          <Input
            id="vendor-attendance-date"
            type="date"
            className="h-10 w-44"
            value={date}
            max={today}
            onChange={(event) => {
              if (event.target.value.length > 0) setDate(event.target.value);
            }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10"
          aria-label="Previous day"
          onClick={() => {
            setDate((value) => shiftDate(value, -1));
          }}
        >
          <ChevronLeft />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="size-10"
          aria-label="Next day"
          disabled={date >= today}
          onClick={() => {
            setDate((value) => shiftDate(value, 1));
          }}
        >
          <ChevronRight />
        </Button>
      </div>
      <div
        className={cn(shownDate !== date && "opacity-60 transition-opacity")}
      >
        <Suspense fallback={<VendorDayGridSkeleton />}>
          <DayGrid projectId={projectId} date={shownDate} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Vendor attendance for a Project (CM-213): mark a day per vendor (Day),
 * the vendor × day month matrix (Month), and overtime lines (Overtime).
 */
export function VendorAttendancePage({
  projectId,
  initialDate,
  initialView = "day",
}: {
  projectId: string;
  /** Defaults to today on this device. */
  initialDate?: string;
  initialView?: "day" | "month" | "overtime";
}) {
  const start = initialDate ?? localToday();
  return (
    <Tabs defaultValue={initialView} className="gap-4">
      <TabsList>
        <TabsTrigger value="day">
          <CalendarDays aria-hidden="true" />
          Day
        </TabsTrigger>
        <TabsTrigger value="month">
          <CalendarRange aria-hidden="true" />
          Month
        </TabsTrigger>
        <TabsTrigger value="overtime">
          <Timer aria-hidden="true" />
          Overtime
        </TabsTrigger>
      </TabsList>
      <TabsContent value="day">
        <DayTab projectId={projectId} initialDate={start} />
      </TabsContent>
      <TabsContent value="month">
        <VendorMonthView
          projectId={projectId}
          initialMonth={start.slice(0, 7)}
        />
      </TabsContent>
      <TabsContent value="overtime">
        <VendorOvertimeView
          projectId={projectId}
          initialFrom={`${start.slice(0, 7)}-01`}
          initialTo={start}
        />
      </TabsContent>
    </Tabs>
  );
}
