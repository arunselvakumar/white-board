"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useDeferredValue, useState } from "react";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
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
import { vendorAttendanceOvertimeQuery } from "@/src/queries/vendor-attendance";
import {
  VENDOR_OVERTIME_COLUMNS,
  VendorOvertimeSkeleton,
} from "@/components/attendance/attendance-skeletons";

/**
 * One focusable scroll area around a wide table (keyboard users can scroll
 * it); the table's own container does not scroll.
 */
const SCROLL =
  "bg-card focus-visible:ring-ring/50 overflow-x-auto rounded-lg border outline-none focus-visible:ring-3 [&>[data-slot=table-container]]:overflow-visible";

function money(paise: number | null): string {
  return paise == null ? "—" : formatPaise(paise);
}

function OvertimeTable({
  projectId,
  from,
  to,
}: {
  projectId: string;
  from: string;
  to: string;
}) {
  const { data } = useSuspenseQuery(
    vendorAttendanceOvertimeQuery(projectId, from, to),
  );
  if (data.items.length === 0)
    return (
      <p className="bg-card text-muted-foreground rounded-lg border p-6 text-center text-sm">
        No vendor overtime between these dates.
      </p>
    );
  return (
    <div
      role="region"
      aria-label="Vendor overtime, scrolls sideways"
      tabIndex={0}
      className={SCROLL}
    >
      <Table aria-label="Vendor overtime">
        <TableHeader>
          <TableRow>
            {VENDOR_OVERTIME_COLUMNS.map((column, index) => (
              <TableHead key={index} className={column.className}>
                {column.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((item) => (
            <TableRow
              key={`${item.attendanceId}:${item.shiftId}:${item.labourCategoryId}`}
            >
              <TableCell className="whitespace-nowrap tabular-nums">
                {item.date}
              </TableCell>
              <TableCell>{item.vendorName}</TableCell>
              <TableCell>{item.shiftName}</TableCell>
              <TableCell>
                {item.labourCategoryName ?? "Deleted category"}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {item.overtimeHours}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(item.overtimePerHour)}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {money(item.overtimeAmount)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4} className="font-semibold">
              Total
            </TableCell>
            <TableCell className="text-right font-semibold tabular-nums">
              {data.totalHours}
            </TableCell>
            <TableCell />
            <TableCell className="text-right font-semibold tabular-nums">
              {money(data.totalAmount)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  );
}

/** Overtime view (CM-213): vendor lines with overtime between two dates. */
export function VendorOvertimeView({
  projectId,
  initialFrom,
  initialTo,
}: {
  projectId: string;
  initialFrom: string;
  initialTo: string;
}) {
  const [from, setFrom] = useState(initialFrom);
  const [to, setTo] = useState(initialTo);
  const valid = from.length > 0 && to.length > 0 && from <= to;
  // Typed dates keep the old lines, dimmed, until the new ones arrive.
  const shownFrom = useDeferredValue(from);
  const shownTo = useDeferredValue(to);
  // The deferred pair can be one the form showed as invalid; don't ask for it.
  const shownValid =
    shownFrom.length > 0 && shownTo.length > 0 && shownFrom <= shownTo;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="vendor-overtime-from">From</Label>
          <Input
            id="vendor-overtime-from"
            type="date"
            className="h-10 w-44"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="vendor-overtime-to">To</Label>
          <Input
            id="vendor-overtime-to"
            type="date"
            className="h-10 w-44"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
            }}
          />
        </div>
      </div>
      {valid ? (
        <div
          className={cn(
            (shownFrom !== from || shownTo !== to) &&
              "opacity-60 transition-opacity",
          )}
        >
          {shownValid ? (
            <Suspense fallback={<VendorOvertimeSkeleton />}>
              <OvertimeTable
                projectId={projectId}
                from={shownFrom}
                to={shownTo}
              />
            </Suspense>
          ) : (
            <VendorOvertimeSkeleton />
          )}
        </div>
      ) : (
        <p role="alert" className="text-destructive text-sm">
          Choose a From date on or before the To date.
        </p>
      )}
    </div>
  );
}
