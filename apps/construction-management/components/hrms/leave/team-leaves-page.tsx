"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Users } from "lucide-react";
import { Suspense, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { LEAVE_SESSION_LABELS } from "@/src/hrms/domain/leave-request";
import {
  leaveOptionsQuery,
  teamLeaveReportQuery,
  teamLeavesQuery,
  type LeaveRequestModel,
} from "@/src/queries/hrms-leave";

import { formatDay, formatDays, localToday } from "./leave-format";
import {
  LeaveDetailSheet,
  LeaveRequestRow,
  StatusBadge,
} from "./leave-request-parts";

function monthRange(month: string): { from: string; to: string } {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, "0")}`,
  };
}

function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + number - 1 + by;
  return `${String(Math.floor(index / 12))}-${String((index % 12) + 1).padStart(2, "0")}`;
}

function monthLabel(month: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

function Nothing({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Users />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/**
 * Team Leaves (CM-313): who is on leave in a month, day by day and as a
 * list, and the team leave report for those with Report.
 */
export function TeamLeavesPage({ today }: { today?: string }) {
  const { data: options } = useSuspenseQuery(leaveOptionsQuery);
  const [month, setMonth] = useState((today ?? localToday()).slice(0, 7));
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 className="text-xl font-semibold tracking-tight">
              Team Leaves
            </h2>
            <p className="text-muted-foreground text-sm">
              Approved and pending leave across your team.
            </p>
          </div>
          {options.permissions.viewTeam ? (
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Previous month"
                onClick={() => {
                  setMonth(shiftMonth(month, -1));
                }}
              >
                <ChevronLeft />
              </Button>
              <p
                className="w-36 text-center text-sm font-medium"
                aria-live="polite"
              >
                {monthLabel(month)}
              </p>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Next month"
                onClick={() => {
                  setMonth(shiftMonth(month, 1));
                }}
              >
                <ChevronRight />
              </Button>
            </div>
          ) : null}
        </div>
        {options.permissions.viewTeam ? (
          <Tabs defaultValue="calendar" className="gap-4">
            <TabsList>
              <TabsTrigger value="calendar">By day</TabsTrigger>
              <TabsTrigger value="list">List</TabsTrigger>
              {options.permissions.report ? (
                <TabsTrigger value="report">Report</TabsTrigger>
              ) : null}
            </TabsList>
            <Suspense
              fallback={
                <div className="space-y-2" aria-busy="true">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              }
            >
              <TabsContent value="calendar">
                <ByDay month={month} />
              </TabsContent>
              <TabsContent value="list">
                <TeamList month={month} />
              </TabsContent>
              {options.permissions.report ? (
                <TabsContent value="report">
                  <Report month={month} />
                </TabsContent>
              ) : null}
            </Suspense>
          </Tabs>
        ) : (
          <Nothing
            title="Team leave is not shared with you"
            description="Seeing everyone's leave needs View All on Leave Management."
          />
        )}
      </div>
    </div>
  );
}

function ByDay({ month }: { month: string }) {
  const { from, to } = monthRange(month);
  const { data } = useSuspenseQuery(teamLeavesQuery(from, to));
  const byDate = new Map<
    string,
    { leave: LeaveRequestModel; session: string }[]
  >();
  for (const leave of data.items)
    for (const day of leave.days)
      if (day.date >= from && day.date <= to)
        byDate.set(day.date, [
          ...(byDate.get(day.date) ?? []),
          { leave, session: day.session },
        ]);
  const dates = [...byDate.keys()].sort();
  if (dates.length === 0)
    return (
      <Nothing
        title="Nobody is on leave"
        description={`No approved or pending leave in ${monthLabel(month)}.`}
      />
    );
  return (
    <ul
      aria-label="Leave by day"
      className="bg-card divide-y rounded-xl border"
    >
      {dates.map((date) => (
        <li
          key={date}
          className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:gap-4"
        >
          <p className="w-28 shrink-0 text-sm font-medium">{formatDay(date)}</p>
          <ul className="flex min-w-0 flex-1 flex-wrap gap-2">
            {(byDate.get(date) ?? []).map(({ leave, session }) => (
              <li
                key={leave.id}
                className="flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm"
              >
                <span className="font-medium">{leave.memberName}</span>
                <span className="text-muted-foreground">
                  {leave.leaveTypeName}
                  {session === "full"
                    ? ""
                    : ` · ${LEAVE_SESSION_LABELS[session as "morning" | "afternoon"]}`}
                </span>
                {leave.status !== "approved" ? (
                  <StatusBadge status={leave.status} />
                ) : null}
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

function TeamList({ month }: { month: string }) {
  const { from, to } = monthRange(month);
  const { data } = useSuspenseQuery(teamLeavesQuery(from, to));
  const [openId, setOpenId] = useState<string | null>(null);
  const open = data.items.find((item) => item.id === openId) ?? null;
  if (data.items.length === 0)
    return (
      <Nothing
        title="Nobody is on leave"
        description={`No approved or pending leave in ${monthLabel(month)}.`}
      />
    );
  return (
    <>
      <ul
        aria-label="Team leave requests"
        className="bg-card divide-y rounded-xl border"
      >
        {data.items.map((leave) => (
          <LeaveRequestRow
            key={leave.id}
            leave={leave}
            showMember
            onOpen={() => {
              setOpenId(leave.id);
            }}
          />
        ))}
      </ul>
      <LeaveDetailSheet
        leave={open}
        onClose={() => {
          setOpenId(null);
        }}
      />
    </>
  );
}

function Report({ month }: { month: string }) {
  const { from, to } = monthRange(month);
  const { data } = useSuspenseQuery(teamLeaveReportQuery(from, to));
  const rows = data.rows.filter(
    (row) => row.paidDays + row.unpaidDays + row.pendingDays > 0,
  );
  if (rows.length === 0)
    return (
      <Nothing
        title="No leave to report"
        description={`No leave was taken in ${monthLabel(month)}.`}
      />
    );
  return (
    <ul
      aria-label="Team leave report"
      className="bg-card divide-y rounded-xl border"
    >
      {rows.map((row) => (
        <li key={row.memberId} className="space-y-1.5 px-4 py-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{row.memberName}</p>
            <p className="text-sm tabular-nums">
              {formatDays(row.paidDays)} paid · {formatDays(row.unpaidDays)}{" "}
              unpaid
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {row.byType.map((item) => (
              <Badge key={item.leaveTypeId} variant="secondary">
                {item.leaveTypeName} {formatDays(item.days)}
              </Badge>
            ))}
            {row.pendingDays > 0 ? (
              <Badge variant="outline">
                {formatDays(row.pendingDays)} pending
              </Badge>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
