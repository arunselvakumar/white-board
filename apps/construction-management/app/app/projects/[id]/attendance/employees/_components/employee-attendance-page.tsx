"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  ListChecks,
} from "lucide-react";
import { UsersThreeIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { Suspense, useDeferredValue, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";

import { pageHref } from "@/lib/page-href";
import { employeeSheetQuery } from "@/src/queries/labour-attendance";

import { EmployeeMarkingSheet } from "./employee-marking-sheet";
import { EmployeeMonthGrid } from "./employee-month-grid";
import { EmployeeRecordedList } from "./employee-recorded-list";
import { EmployeeMarkingSheetSkeleton } from "@/app/app/projects/[id]/attendance/_components/attendance-skeletons";

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function shiftDate(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

function NoEmployees({ projectId }: { projectId: string }) {
  return (
    <EmptyState
      className="bg-card border"
      icon={UsersThreeIcon}
      tone="violet"
      title="No Employees on this Project"
      description="Add Employees to this Project on its Teams page, or transfer them here, to mark their attendance."
      actions={
        <Link
          href={pageHref("/app/projects/[id]/teams", { id: projectId })}
          className={buttonVariants()}
        >
          Go to Teams
        </Link>
      }
    />
  );
}

function Sheet({
  projectId,
  date,
  onSaved,
}: {
  projectId: string;
  date: string;
  onSaved: (message: string) => void;
}) {
  const { data } = useSuspenseQuery(employeeSheetQuery(projectId, date));
  if (data.employees.length === 0) return <NoEmployees projectId={projectId} />;
  // A new version of the sheet (after a save) starts a fresh form.
  const version = data.employees
    .map((row) => `${row.employeeId}:${row.attendance?.updatedAt ?? ""}`)
    .join("|");
  return (
    <EmployeeMarkingSheet
      key={`${date}#${version}`}
      projectId={projectId}
      date={date}
      sheet={data}
      onSaved={onSaved}
    />
  );
}

function MarkTab({
  projectId,
  initialDate,
}: {
  projectId: string;
  initialDate: string;
}) {
  const [date, setDate] = useState(initialDate);
  // The last day's sheet stays on screen, dimmed, while the next one loads.
  const shownDate = useDeferredValue(date);
  const [message, setMessage] = useState<string>();
  const today = localToday();
  const move = (next: string) => {
    setDate(next);
    setMessage(undefined);
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="employee-attendance-date">Date</Label>
          <Input
            id="employee-attendance-date"
            type="date"
            className="h-10 w-44"
            value={date}
            max={today}
            onChange={(event) => {
              if (event.target.value.length > 0) move(event.target.value);
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
            move(shiftDate(date, -1));
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
            move(shiftDate(date, 1));
          }}
        >
          <ChevronRight />
        </Button>
        {message == null ? null : (
          <p
            role="status"
            className="text-sm font-medium text-emerald-700 dark:text-emerald-400"
          >
            {message}
          </p>
        )}
      </div>
      <div
        className={cn(shownDate !== date && "opacity-60 transition-opacity")}
      >
        <Suspense fallback={<EmployeeMarkingSheetSkeleton />}>
          <Sheet projectId={projectId} date={shownDate} onSaved={setMessage} />
        </Suspense>
      </div>
    </div>
  );
}

/**
 * Employee attendance for a Project: mark a day (Mark), the recorded days
 * with filters (Recorded), and the Employee × day month grid (Month).
 */
export function EmployeeAttendancePage({
  projectId,
  initialDate,
  initialView = "mark",
}: {
  projectId: string;
  /** Defaults to today on this device. */
  initialDate?: string;
  initialView?: "mark" | "recorded" | "month";
}) {
  const start = initialDate ?? localToday();
  return (
    <Tabs defaultValue={initialView} className="gap-4">
      <TabsList>
        <TabsTrigger value="mark">
          <ClipboardCheck aria-hidden="true" />
          Mark
        </TabsTrigger>
        <TabsTrigger value="recorded">
          <ListChecks aria-hidden="true" />
          Recorded
        </TabsTrigger>
        <TabsTrigger value="month">
          <CalendarRange aria-hidden="true" />
          Month
        </TabsTrigger>
      </TabsList>
      <TabsContent value="mark">
        <MarkTab projectId={projectId} initialDate={start} />
      </TabsContent>
      <TabsContent value="recorded">
        <EmployeeRecordedList
          projectId={projectId}
          initialFrom={`${start.slice(0, 7)}-01`}
          initialTo={start}
        />
      </TabsContent>
      <TabsContent value="month">
        <EmployeeMonthGrid
          projectId={projectId}
          initialMonth={start.slice(0, 7)}
        />
      </TabsContent>
    </Tabs>
  );
}
