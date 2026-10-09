"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
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
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { labourSheetQuery } from "@/src/queries/labour-attendance";

import { LabourMarkingSheet } from "./labour-marking-sheet";
import { LabourMonthGrid } from "./labour-month-grid";
import { LabourRecordedList } from "./labour-recorded-list";

export const LABOUR_MASTERS_PATH = "/app/masters/labours";

/** Today on this device, `YYYY-MM-DD`. */
export function localToday(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${String(now.getFullYear())}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export function shiftDate(date: string, days: number): string {
  const time = Date.parse(`${date}T00:00:00Z`) + days * 86_400_000;
  return new Date(time).toISOString().slice(0, 10);
}

function NoLabourers() {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Users />
        </EmptyMedia>
        <EmptyTitle>No labourers on this Project</EmptyTitle>
        <EmptyDescription>
          Add labourers to this Project in Masters → Labours, or transfer them
          here, to mark their attendance.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link href={LABOUR_MASTERS_PATH} className={buttonVariants()}>
          Go to Labours
        </Link>
      </EmptyContent>
    </Empty>
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
  const { data } = useSuspenseQuery(labourSheetQuery(projectId, date));
  if (data.labourers.length === 0) return <NoLabourers />;
  // A new version of the sheet (after a save) starts a fresh form.
  const version = data.labourers
    .map((row) => `${row.labourId}:${row.attendance?.updatedAt ?? ""}`)
    .join("|");
  return (
    <LabourMarkingSheet
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
          <Label htmlFor="labour-attendance-date">Date</Label>
          <Input
            id="labour-attendance-date"
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
      <Suspense
        fallback={
          <div className="space-y-2" aria-hidden="true">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        }
      >
        <Sheet projectId={projectId} date={date} onSaved={setMessage} />
      </Suspense>
    </div>
  );
}

/**
 * Labour attendance for a Project (CM-211): mark a day (Mark), the recorded
 * days with filters (Recorded), and the labourer × day month grid (Month).
 */
export function LabourAttendancePage({
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
        <TabsTrigger value="mark">Mark</TabsTrigger>
        <TabsTrigger value="recorded">Recorded</TabsTrigger>
        <TabsTrigger value="month">Month</TabsTrigger>
      </TabsList>
      <TabsContent value="mark">
        <MarkTab projectId={projectId} initialDate={start} />
      </TabsContent>
      <TabsContent value="recorded">
        <LabourRecordedList
          projectId={projectId}
          initialFrom={`${start.slice(0, 7)}-01`}
          initialTo={start}
        />
      </TabsContent>
      <TabsContent value="month">
        <LabourMonthGrid
          projectId={projectId}
          initialMonth={start.slice(0, 7)}
        />
      </TabsContent>
    </Tabs>
  );
}
