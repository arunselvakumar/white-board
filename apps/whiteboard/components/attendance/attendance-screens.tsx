"use client";

import { useAuth } from "@repo/auth/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@repo/ui/components/button";

import { batchQueries } from "@/src/queries/batches";
import {
  attendanceQueries,
  openAttendanceRegister,
  saveAttendanceMarks,
  type AttendanceRegister,
} from "@/src/queries/attendance";
import { AttendanceForm } from "./attendance-form";
import { BackdatedAttendanceForm } from "./backdated-attendance-form";

type Cursor = { after?: string; before?: string };
type Scoped<T> = { scope: string; value: T };

function todayInTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function AttendanceEmptyState() {
  return (
    <p className="text-muted-foreground">
      No Attendance Register yet. Open a Register to mark Students.
    </p>
  );
}

export function AttendanceBatchesScreen() {
  const { workspaceId } = useAuth();
  const [pageCursor, setPageCursor] = useState<Scoped<Cursor> | null>(null);
  const cursor =
    pageCursor?.scope === workspaceId ? pageCursor.value : undefined;
  const batches = useQuery(
    batchQueries.list({ limit: 20, workspaceId, ...cursor }),
  );

  return (
    <main className="w-full p-6">
      <div className="max-w-4xl space-y-6">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <p className="text-muted-foreground">
          Choose a Batch to open an Attendance Register or review earlier
          Registers.
        </p>
        {batches.isPending ? (
          <p>Loading Batches…</p>
        ) : batches.isError ? (
          <p role="alert">Could not load Batches.</p>
        ) : (
          <>
            {batches.data.items.length === 0 ? (
              <p className="text-muted-foreground">No Batches on this page.</p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2">
                {batches.data.items.map((batch) => (
                  <li key={batch.id}>
                    <Link
                      className="hover:bg-muted block rounded-xl border p-5"
                      href={`/attendance/batches/${batch.id}`}
                    >
                      <strong>{batch.name}</strong>
                      <span className="text-muted-foreground mt-1 block text-sm">
                        {batch.closedAt ? "Closed · " : ""}
                        {batch.timezone}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!batches.data.prevCursor}
                onClick={() => {
                  setPageCursor({
                    scope: workspaceId ?? "",
                    value: { before: batches.data.prevCursor ?? undefined },
                  });
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!batches.data.nextCursor}
                onClick={() => {
                  setPageCursor({
                    scope: workspaceId ?? "",
                    value: { after: batches.data.nextCursor ?? undefined },
                  });
                }}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export function BatchAttendanceScreen({
  batchId,
  teacher = false,
}: {
  batchId: string;
  teacher?: boolean;
}) {
  const { workspaceId, userId } = useAuth();
  const scope = `${workspaceId ?? ""}:${userId ?? ""}:${batchId}`;
  const client = useQueryClient();
  const [selected, setSelected] = useState<Scoped<AttendanceRegister> | null>(
    null,
  );
  const [pageCursor, setPageCursor] = useState<Scoped<Cursor> | null>(null);
  const [error, setError] = useState<Scoped<string> | null>(null);
  const [opening, setOpening] = useState(false);
  const cursor = pageCursor?.scope === scope ? pageCursor.value : undefined;
  const registers = useQuery(
    attendanceQueries.batch(workspaceId, userId, batchId, cursor),
  );
  const chosen = selected?.scope === scope ? selected.value : null;
  const today =
    registers.data?.items.find(
      (item) => item.date === todayInTimezone(item.timezone),
    ) ?? null;
  const current = chosen ?? today;
  const backHref = teacher ? "/teacher" : "/attendance";
  const openDate = async (date?: string) => {
    const value = await openAttendanceRegister(batchId, date);
    setSelected({ scope, value });
    setPageCursor(null);
    await client.invalidateQueries({ queryKey: attendanceQueries.key.all });
  };

  return (
    <main className="w-full p-6">
      <div className="max-w-4xl space-y-6">
        <Link href={backHref} className="text-sm underline">
          {teacher ? "My Batches" : "Attendance"}
        </Link>
        <h1 className="text-2xl font-semibold">Batch Attendance</h1>
        {registers.isPending ? (
          <p>Loading Attendance…</p>
        ) : registers.isError ? (
          <p role="alert">Could not load Attendance for this Batch.</p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground">
                {current
                  ? `Register for ${current.date}`
                  : "Today’s Register has not been opened."}
              </p>
              <Button
                type="button"
                disabled={opening}
                onClick={async () => {
                  setOpening(true);
                  setError(null);
                  try {
                    await openDate();
                  } catch (cause) {
                    setError({
                      scope,
                      value:
                        cause instanceof Error
                          ? cause.message
                          : "Could not open Attendance.",
                    });
                  } finally {
                    setOpening(false);
                  }
                }}
              >
                {opening ? "Opening…" : "Open today’s Register"}
              </Button>
            </div>
            <BackdatedAttendanceForm onOpen={openDate} />
            {error?.scope === scope && (
              <p role="alert" className="text-destructive">
                {error.value}
              </p>
            )}
            {current ? (
              <>
                <div className="rounded-xl border p-4 text-sm">
                  <p className="font-medium">
                    {current.summary.complete ? "Complete" : "Incomplete"} ·{" "}
                    {current.summary.total} Students
                  </p>
                  <p className="text-muted-foreground mt-1">
                    {current.summary.present} Present · {current.summary.absent}{" "}
                    Absent · {current.summary.late} Late ·{" "}
                    {current.summary.excused} Excused ·{" "}
                    {current.summary.unmarked} Unmarked
                  </p>
                </div>
                <AttendanceForm
                  key={`${current.id}-${current.updatedAt}`}
                  register={current}
                  onSave={async (marks) => {
                    const value = await saveAttendanceMarks(current.id, marks);
                    setSelected({ scope, value });
                    await client.invalidateQueries({
                      queryKey: attendanceQueries.key.all,
                    });
                  }}
                />
              </>
            ) : (
              <AttendanceEmptyState />
            )}
            {registers.data.items.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-lg font-semibold">Registers</h2>
                <ul className="space-y-2">
                  {registers.data.items.map((item) => (
                    <li key={item.id}>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSelected({ scope, value: item });
                        }}
                      >
                        {item.date} · {item.summary.attended}/
                        {item.summary.total} attended
                      </Button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={!registers.data.prevCursor}
                onClick={() => {
                  setPageCursor({
                    scope,
                    value: { before: registers.data.prevCursor ?? undefined },
                  });
                  setSelected(null);
                }}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={!registers.data.nextCursor}
                onClick={() => {
                  setPageCursor({
                    scope,
                    value: { after: registers.data.nextCursor ?? undefined },
                  });
                  setSelected(null);
                }}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
