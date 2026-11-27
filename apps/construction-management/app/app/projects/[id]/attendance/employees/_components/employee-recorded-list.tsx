"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useDeferredValue, useState, useTransition } from "react";
import { MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { EmptyState } from "@repo/ui/components/empty-state";
import { cn } from "@repo/ui/lib/utils";

import { FormAlert } from "@/components/auth/form-alert";
import { formatPaise } from "@/components/money/money-input";
import { endsNextDay } from "@/src/labour/domain/wages";
import { QueryHttpError } from "@/src/queries/http";
import {
  employeeAttendanceListQuery,
  employeeSheetQuery,
  useSetEmployeePaidLeave,
  type EmployeeAttendanceDay,
  type EmployeeAttendanceListFilter,
} from "@/src/queries/labour-attendance";

import { STATUS_LABELS } from "./employee-sheet-form";
import {
  EMPLOYEE_RECORDED_COLUMNS,
  EmployeeRecordedSkeleton,
} from "@/app/app/projects/[id]/attendance/_components/attendance-skeletons";

const ALL = "all";

const STATUS_FILTERS = [
  { value: ALL, label: "Every status" },
  { value: "present", label: "Present" },
  { value: "half_day", label: "Half Day" },
  { value: "absent", label: "Absent" },
  { value: "on_leave", label: "On Leave" },
  { value: "paid_leave", label: "Paid Leave" },
  { value: "holiday", label: "Holiday" },
];

function FilterSelect({
  label,
  value,
  items,
  onChange,
}: {
  label: string;
  value: string;
  items: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next) => {
        if (next != null) onChange(next);
      }}
    >
      <SelectTrigger aria-label={label} className="h-10 w-full sm:w-48">
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        align="start"
        alignItemWithTrigger={false}
        aria-label={label}
      >
        {items.map((item) => (
          <SelectItem key={item.value} value={item.value}>
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function PaidLeaveButton({ day }: { day: EmployeeAttendanceDay }) {
  const change = useSetEmployeePaidLeave();
  const [error, setError] = useState<string>();
  return (
    <div className="space-y-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={change.isPending}
        onClick={() => {
          setError(undefined);
          change.mutate(
            {
              id: day.id,
              isPaidLeave: !day.isPaidLeave,
              expectedUpdatedAt: day.updatedAt,
            },
            {
              onError: (failure) => {
                setError(
                  failure instanceof QueryHttpError
                    ? failure.message
                    : "Something went wrong.",
                );
              },
            },
          );
        }}
      >
        {day.isPaidLeave ? "Mark unpaid" : "Mark Paid Leave"}
      </Button>
      <FormAlert message={error} />
    </div>
  );
}

function statusText(day: EmployeeAttendanceDay): string {
  return day.status === "on_leave" && day.isPaidLeave
    ? "Paid Leave"
    : STATUS_LABELS[day.status];
}

/** A check-out on the next day (a night shift) carries "+1". */
function CheckOut({ day }: { day: EmployeeAttendanceDay }) {
  if (day.checkOut == null) return <>—</>;
  const nextDay = day.checkIn != null && endsNextDay(day.checkIn, day.checkOut);
  return (
    <>
      {day.checkOut}
      {nextDay ? (
        <>
          <span
            aria-hidden="true"
            className="text-muted-foreground ml-1 text-xs"
            title="Next day"
          >
            +1
          </span>
          <span className="sr-only"> next day</span>
        </>
      ) : null}
    </>
  );
}

/** "In 08:00 · Out 19:00 · Worked 10 h" for a phone card; null without times. */
function TimesLine({ day }: { day: EmployeeAttendanceDay }) {
  if (day.checkIn == null) return null;
  return (
    <p className="text-muted-foreground text-sm tabular-nums">
      In <span className="text-foreground">{day.checkIn}</span> · Out{" "}
      <span className="text-foreground">
        <CheckOut day={day} />
      </span>
      {day.workedHours == null ? null : (
        <>
          {" "}
          · Worked <span className="text-foreground">{day.workedHours} h</span>
        </>
      )}
    </p>
  );
}

function Results({
  filter,
  onCursor,
}: {
  filter: EmployeeAttendanceListFilter;
  onCursor: (cursor: EmployeeAttendanceListFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(employeeAttendanceListQuery(filter));
  if (data.items.length === 0)
    return (
      <EmptyState
        className="bg-card border"
        icon={MagnifyingGlassIcon}
        tone="neutral"
        title="No attendance matches these filters."
      />
    );
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{data.total} days</p>
      <ul className="space-y-2 lg:hidden">
        {data.items.map((day) => (
          <li key={day.id} className="bg-card space-y-2 rounded-xl border p-3">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{day.employeeName}</span>
              <span className="text-muted-foreground text-sm">{day.date}</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge variant="secondary">{statusText(day)}</Badge>
              {day.shift == null ? null : <span>{day.shift}</span>}
              {Number(day.overtimeHours) > 0 ? (
                <span>{day.overtimeHours} h OT</span>
              ) : null}
              {day.total == null ? null : (
                <span className="ml-auto font-medium tabular-nums">
                  {formatPaise(day.total)}
                </span>
              )}
            </div>
            <TimesLine day={day} />
            {day.status === "on_leave" ? <PaidLeaveButton day={day} /> : null}
          </li>
        ))}
      </ul>
      <div className="bg-card hidden rounded-lg border lg:block">
        <Table aria-label="Recorded Employee attendance">
          <TableHeader>
            <TableRow>
              {EMPLOYEE_RECORDED_COLUMNS.map((column, index) => (
                <TableHead key={index} className={column.className}>
                  {column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((day) => (
              <TableRow key={day.id}>
                <TableCell className="tabular-nums">{day.date}</TableCell>
                <TableCell className="font-medium">
                  {day.employeeName}
                </TableCell>
                <TableCell>{statusText(day)}</TableCell>
                <TableCell>{day.shift ?? "—"}</TableCell>
                <TableCell className="tabular-nums">
                  {day.checkIn ?? "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  <CheckOut day={day} />
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {day.workedHours ?? "—"}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {day.overtimeHours}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {day.total == null ? "—" : formatPaise(day.total)}
                </TableCell>
                <TableCell>
                  {day.status === "on_leave" ? (
                    <PaidLeaveButton day={day} />
                  ) : null}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={data.prevCursor == null}
          onClick={() => {
            if (data.prevCursor != null) onCursor({ before: data.prevCursor });
          }}
        >
          Newer
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={data.nextCursor == null}
          onClick={() => {
            if (data.nextCursor != null) onCursor({ after: data.nextCursor });
          }}
        >
          Older
        </Button>
      </div>
    </div>
  );
}

/**
 * Recorded Employee days of a Project with filters, with check-in, check-out
 * and hours worked.
 */
export function EmployeeRecordedList({
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
  const [employeeId, setEmployeeId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [cursor, setCursor] =
    useState<EmployeeAttendanceListFilter["cursor"]>(null);
  const [paging, startTransition] = useTransition();
  // Typed dates and picked filters keep the old rows, dimmed, until the new
  // ones arrive.
  const shownFrom = useDeferredValue(from);
  const shownTo = useDeferredValue(to);
  // Employees on the Project, for the picker.
  const options = useQuery(employeeSheetQuery(projectId, initialTo));
  const filter: EmployeeAttendanceListFilter = {
    projectId,
    from: shownFrom || undefined,
    to: shownTo || undefined,
    employeeId: employeeId === ALL ? undefined : employeeId,
    status: status === ALL ? undefined : status,
    cursor,
  };
  const reset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      startTransition(() => {
        set(value);
        setCursor(null);
      });
    };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="employee-recorded-from">From</Label>
          <Input
            id="employee-recorded-from"
            type="date"
            className="h-10 sm:w-44"
            value={from}
            onChange={(event) => {
              // A controlled input updates at once; the rows follow
              // through `shownFrom`.
              setFrom(event.target.value);
              setCursor(null);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="employee-recorded-to">To</Label>
          <Input
            id="employee-recorded-to"
            type="date"
            className="h-10 sm:w-44"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setCursor(null);
            }}
          />
        </div>
        <FilterSelect
          label="Employee"
          value={employeeId}
          items={[
            { value: ALL, label: "Every Employee" },
            ...(options.data?.employees ?? []).map((row) => ({
              value: row.employeeId,
              label: row.name,
            })),
          ]}
          onChange={reset(setEmployeeId)}
        />
        <FilterSelect
          label="Status"
          value={status}
          items={STATUS_FILTERS}
          onChange={reset(setStatus)}
        />
      </div>
      <div
        className={cn(
          (paging || shownFrom !== from || shownTo !== to) &&
            "opacity-60 transition-opacity",
        )}
      >
        <Suspense fallback={<EmployeeRecordedSkeleton />}>
          <Results
            filter={filter}
            onCursor={(next) => {
              startTransition(() => {
                setCursor(next);
              });
            }}
          />
        </Suspense>
      </div>
    </div>
  );
}
