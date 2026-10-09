"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { cn } from "@repo/ui/lib/utils";

import { formatPaise } from "@/components/money/money-input";
import {
  labourAttendanceMonthQuery,
  type LabourAttendanceMonth,
} from "@/src/queries/labour-attendance";

type Totals = LabourAttendanceMonth["totals"];

/** One focusable scroll area around the wide grid. */
const SCROLL =
  "focus-visible:ring-ring/50 overflow-x-auto rounded-lg border outline-none focus-visible:ring-3 [&>[data-slot=table-container]]:overflow-visible";

const CODE_STYLE: Record<string, string> = {
  P: "text-emerald-700 dark:text-emerald-400",
  H: "text-amber-700 dark:text-amber-400",
  A: "text-destructive",
  L: "text-muted-foreground",
  PL: "text-sky-700 dark:text-sky-400",
  HO: "text-violet-700 dark:text-violet-400",
};

function money(paise: number | null): string {
  return paise == null ? "—" : formatPaise(paise);
}

function TotalsCells({ totals }: { totals: Totals }) {
  return (
    <>
      {[
        totals.present,
        totals.halfDay,
        totals.absent,
        totals.leave,
        totals.paidLeave,
        totals.holiday,
      ].map((value, index) => (
        <TableCell key={index} className="text-right tabular-nums">
          {value}
        </TableCell>
      ))}
      <TableCell className="text-right tabular-nums">
        {totals.overtimeHours}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {money(totals.total)}
      </TableCell>
    </>
  );
}

function Grid({ projectId, month }: { projectId: string; month: string }) {
  const { data } = useSuspenseQuery(
    labourAttendanceMonthQuery(projectId, month),
  );
  if (data.labourers.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        No Labours on this Project in this month.
      </p>
    );
  const counts = new Map(data.dayCounts.map((row) => [row.date, row]));
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-xs">
        P Present · H Half Day · A Absent · L Leave · PL Paid Leave · HO Holiday
        · a number under the code is overtime hours.
      </p>
      <div
        role="region"
        aria-label="Labour attendance by day, scrolls sideways"
        tabIndex={0}
        className={SCROLL}
      >
        <Table aria-label="Labour attendance by day">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-background sticky left-0 min-w-36">
                Labour
              </TableHead>
              {data.dates.map((date) => (
                <TableHead key={date} className="px-1 text-center tabular-nums">
                  {Number(date.slice(8))}
                </TableHead>
              ))}
              <TableHead className="text-right">P</TableHead>
              <TableHead className="text-right">H</TableHead>
              <TableHead className="text-right">A</TableHead>
              <TableHead className="text-right">L</TableHead>
              <TableHead className="text-right">PL</TableHead>
              <TableHead className="text-right">HO</TableHead>
              <TableHead className="text-right">OT h</TableHead>
              <TableHead className="text-right">Earned</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.labourers.map((row) => {
              const byDate = new Map(row.days.map((day) => [day.date, day]));
              return (
                <TableRow key={row.labourId} aria-label={row.name}>
                  <TableHead
                    scope="row"
                    className="bg-background sticky left-0 font-medium"
                  >
                    {row.name}
                  </TableHead>
                  {data.dates.map((date) => {
                    const day = byDate.get(date);
                    return (
                      <TableCell
                        key={date}
                        className="px-1 text-center text-xs font-semibold whitespace-nowrap"
                        aria-label={
                          day == null
                            ? undefined
                            : `${row.name} ${date} ${day.code}`
                        }
                      >
                        {day == null ? null : (
                          <>
                            <span className={cn(CODE_STYLE[day.code])}>
                              {day.code}
                            </span>
                            {Number(day.overtimeHours) > 0 ? (
                              <span className="text-muted-foreground block font-normal">
                                {day.overtimeHours}
                              </span>
                            ) : null}
                          </>
                        )}
                      </TableCell>
                    );
                  })}
                  <TotalsCells totals={row.totals} />
                </TableRow>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableHead
                scope="row"
                className="bg-muted sticky left-0 font-semibold"
              >
                Present
              </TableHead>
              {data.dates.map((date) => {
                const count = counts.get(date);
                return (
                  <TableCell
                    key={date}
                    className="px-1 text-center text-xs tabular-nums"
                  >
                    {count == null
                      ? ""
                      : count.present +
                        (count.halfDay > 0 ? count.halfDay / 2 : 0)}
                  </TableCell>
                );
              })}
              <TotalsCells totals={data.totals} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
}

/** Month grid (CM-211): labourer × day codes with totals per labourer. */
export function LabourMonthGrid({
  projectId,
  initialMonth,
}: {
  projectId: string;
  initialMonth: string;
}) {
  const [month, setMonth] = useState(initialMonth);
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="labour-attendance-month">Month</Label>
        <Input
          id="labour-attendance-month"
          type="month"
          className="h-10 w-44"
          value={month}
          onChange={(event) => {
            if (event.target.value.length > 0) setMonth(event.target.value);
          }}
        />
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <Grid projectId={projectId} month={month} />
      </Suspense>
    </div>
  );
}
