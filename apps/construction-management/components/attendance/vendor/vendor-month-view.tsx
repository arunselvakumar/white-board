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

import { formatPaise } from "@/components/money/money-input";
import {
  vendorAttendanceMonthQuery,
  type VendorAttendanceMonth,
} from "@/src/queries/vendor-attendance";

type Counts = VendorAttendanceMonth["totals"];

/**
 * One focusable scroll area around a wide table (keyboard users can scroll
 * it); the table's own container does not scroll.
 */
const SCROLL =
  "focus-visible:ring-ring/50 overflow-x-auto rounded-lg border outline-none focus-visible:ring-3 [&>[data-slot=table-container]]:overflow-visible";

function money(paise: number | null): string {
  return paise == null ? "—" : formatPaise(paise);
}

/** `3 + 1½ · 2h` for a cell: full, half, overtime hours. */
function cellText(counts: Counts): string {
  const heads =
    counts.halfDayCount > 0
      ? `${String(counts.fullDayCount)} + ${String(counts.halfDayCount)}½`
      : String(counts.fullDayCount);
  return Number(counts.overtimeHours) > 0
    ? `${heads} · ${counts.overtimeHours}h`
    : heads;
}

function TotalsCells({ counts }: { counts: Counts }) {
  return (
    <>
      <TableCell className="text-right tabular-nums">
        {counts.fullDayCount}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {counts.halfDayCount}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {counts.overtimeHours}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">
        {money(counts.pay)}
      </TableCell>
    </>
  );
}

function MonthTable({
  projectId,
  month,
}: {
  projectId: string;
  month: string;
}) {
  const { data } = useSuspenseQuery(
    vendorAttendanceMonthQuery(projectId, month),
  );
  if (data.vendors.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        No vendor attendance recorded in this month.
      </p>
    );
  const dayTotals = new Map(data.dayTotals.map((row) => [row.date, row]));
  return (
    <div className="space-y-6">
      <div
        role="region"
        aria-label="Vendor attendance by day, scrolls sideways"
        tabIndex={0}
        className={SCROLL}
      >
        <Table aria-label="Vendor attendance by day">
          <TableHeader>
            <TableRow>
              <TableHead className="bg-background sticky left-0 min-w-36">
                Vendor
              </TableHead>
              {data.dates.map((date) => (
                <TableHead key={date} className="text-center tabular-nums">
                  {Number(date.slice(8))}
                </TableHead>
              ))}
              <TableHead className="text-right">Full</TableHead>
              <TableHead className="text-right">Half</TableHead>
              <TableHead className="text-right">OT h</TableHead>
              <TableHead className="text-right">Pay</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.vendors.map((row) => {
              const byDate = new Map(row.days.map((day) => [day.date, day]));
              return (
                <TableRow key={row.vendorId}>
                  <TableHead
                    scope="row"
                    className="bg-background sticky left-0 font-medium"
                  >
                    {row.vendorName}
                  </TableHead>
                  {data.dates.map((date) => {
                    const day = byDate.get(date);
                    return (
                      <TableCell
                        key={date}
                        className="text-center text-xs whitespace-nowrap tabular-nums"
                        title={
                          day?.pay == null ? undefined : formatPaise(day.pay)
                        }
                      >
                        {day == null ? null : <span>{cellText(day)}</span>}
                        {day?.pay == null ? null : (
                          <span className="text-muted-foreground block">
                            {formatPaise(day.pay)}
                          </span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TotalsCells counts={row.totals} />
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
                Total
              </TableHead>
              {data.dates.map((date) => {
                const total = dayTotals.get(date);
                return (
                  <TableCell
                    key={date}
                    className="text-center text-xs whitespace-nowrap tabular-nums"
                  >
                    {total == null ? "" : cellText(total)}
                  </TableCell>
                );
              })}
              <TotalsCells counts={data.totals} />
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      <section aria-labelledby="vendor-month-categories" className="space-y-2">
        <h3 id="vendor-month-categories" className="font-semibold">
          By Labour Category
        </h3>
        <div
          role="region"
          aria-label="Vendor attendance by Labour Category, scrolls sideways"
          tabIndex={0}
          className={SCROLL}
        >
          <Table aria-label="Vendor attendance by Labour Category">
            <TableHeader>
              <TableRow>
                <TableHead>Labour Category</TableHead>
                <TableHead className="text-right">Full</TableHead>
                <TableHead className="text-right">Half</TableHead>
                <TableHead className="text-right">OT h</TableHead>
                <TableHead className="text-right">Pay</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.categories.map((row) => (
                <TableRow key={row.labourCategoryId}>
                  <TableCell>
                    {row.labourCategoryName ?? "Deleted category"}
                  </TableCell>
                  <TotalsCells counts={row} />
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

/** Month view (CM-213): vendor × day matrix with totals per vendor and category. */
export function VendorMonthView({
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
        <Label htmlFor="vendor-attendance-month">Month</Label>
        <Input
          id="vendor-attendance-month"
          type="month"
          className="h-10 w-44"
          value={month}
          onChange={(event) => {
            if (/^\d{4}-\d{2}$/.test(event.target.value))
              setMonth(event.target.value);
          }}
        />
      </div>
      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
        <MonthTable projectId={projectId} month={month} />
      </Suspense>
    </div>
  );
}
