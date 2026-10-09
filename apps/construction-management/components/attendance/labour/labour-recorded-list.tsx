"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Suspense, useState } from "react";
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
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";

import { FormAlert } from "@/components/auth/form-alert";
import { formatPaise } from "@/components/money/money-input";
import { QueryHttpError } from "@/src/queries/http";
import {
  labourAttendanceListQuery,
  labourSheetQuery,
  useSetLabourPaidLeave,
  type LabourAttendanceDay,
  type LabourAttendanceListFilter,
} from "@/src/queries/labour-attendance";

import { STATUS_LABELS } from "./labour-sheet-form";

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

function PaidLeaveButton({ day }: { day: LabourAttendanceDay }) {
  const change = useSetLabourPaidLeave();
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

function statusText(day: LabourAttendanceDay): string {
  return day.status === "on_leave" && day.isPaidLeave
    ? "Paid Leave"
    : STATUS_LABELS[day.status];
}

function Results({
  filter,
  onCursor,
}: {
  filter: LabourAttendanceListFilter;
  onCursor: (cursor: LabourAttendanceListFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(labourAttendanceListQuery(filter));
  if (data.items.length === 0)
    return (
      <p className="text-muted-foreground rounded-lg border p-6 text-center text-sm">
        No attendance matches these filters.
      </p>
    );
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">{data.total} days</p>
      <ul className="space-y-2 lg:hidden">
        {data.items.map((day) => (
          <li key={day.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{day.labourName}</span>
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
            {day.status === "on_leave" ? <PaidLeaveButton day={day} /> : null}
          </li>
        ))}
      </ul>
      <div className="hidden rounded-lg border lg:block">
        <Table aria-label="Recorded labour attendance">
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Labourer</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Shift</TableHead>
              <TableHead>Supervisor</TableHead>
              <TableHead className="text-right">OT h</TableHead>
              <TableHead className="text-right">Wages</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((day) => (
              <TableRow key={day.id}>
                <TableCell className="tabular-nums">{day.date}</TableCell>
                <TableCell className="font-medium">{day.labourName}</TableCell>
                <TableCell>{statusText(day)}</TableCell>
                <TableCell>{day.shift ?? "—"}</TableCell>
                <TableCell>{day.supervisor?.name ?? "—"}</TableCell>
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

/** Recorded labour days of a Project with filters (CM-211). */
export function LabourRecordedList({
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
  const [labourId, setLabourId] = useState(ALL);
  const [supervisorId, setSupervisorId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [cursor, setCursor] =
    useState<LabourAttendanceListFilter["cursor"]>(null);
  // Labourers and supervisors on the Project, for the pickers.
  const options = useQuery(labourSheetQuery(projectId, initialTo));
  const filter: LabourAttendanceListFilter = {
    projectId,
    from: from || undefined,
    to: to || undefined,
    labourId: labourId === ALL ? undefined : labourId,
    supervisorId: supervisorId === ALL ? undefined : supervisorId,
    status: status === ALL ? undefined : status,
    cursor,
  };
  const reset =
    <T,>(set: (value: T) => void) =>
    (value: T) => {
      set(value);
      setCursor(null);
    };
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="labour-recorded-from">From</Label>
          <Input
            id="labour-recorded-from"
            type="date"
            className="h-10 sm:w-44"
            value={from}
            onChange={(event) => {
              reset(setFrom)(event.target.value);
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="labour-recorded-to">To</Label>
          <Input
            id="labour-recorded-to"
            type="date"
            className="h-10 sm:w-44"
            value={to}
            onChange={(event) => {
              reset(setTo)(event.target.value);
            }}
          />
        </div>
        <FilterSelect
          label="Labourer"
          value={labourId}
          items={[
            { value: ALL, label: "Every labourer" },
            ...(options.data?.labourers ?? []).map((row) => ({
              value: row.labourId,
              label: row.name,
            })),
          ]}
          onChange={reset(setLabourId)}
        />
        <FilterSelect
          label="Supervisor"
          value={supervisorId}
          items={[
            { value: ALL, label: "Every supervisor" },
            ...(options.data?.supervisors ?? []).map((item) => ({
              value: item.id,
              label: item.name,
            })),
          ]}
          onChange={reset(setSupervisorId)}
        />
        <FilterSelect
          label="Status"
          value={status}
          items={STATUS_FILTERS}
          onChange={reset(setStatus)}
        />
      </div>
      <Suspense fallback={<Skeleton className="h-48 w-full" />}>
        <Results filter={filter} onCursor={setCursor} />
      </Suspense>
    </div>
  );
}
