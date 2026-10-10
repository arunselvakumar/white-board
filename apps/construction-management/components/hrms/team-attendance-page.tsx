"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import type { LiveState } from "@/src/hrms/domain/attendance";
import {
  hrmsTeamTodayQuery,
  type HrmsTeamToday,
} from "@/src/queries/hrms-attendance";

import {
  AttendanceRead,
  LiveStateBadge,
  formatClock,
  formatWeekdayDate,
  hoursText,
} from "./attendance-parts";
import { HrmsEmpty, HrmsPage } from "./hrms-parts";

type Filter =
  | "all"
  | "checked_in"
  | "checked_out"
  | "not_checked_in"
  | "on_leave"
  | "off"
  | "late";

type Item = HrmsTeamToday["items"][number];

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "checked_in", label: "Checked in" },
  { value: "checked_out", label: "Checked out" },
  { value: "not_checked_in", label: "Not checked in" },
  { value: "late", label: "Late" },
  { value: "on_leave", label: "On Leave" },
  { value: "off", label: "Day off" },
];

const OFF: readonly LiveState[] = ["holiday", "week_off"];

function matches(item: Item, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "late") return item.late;
  if (filter === "off") return OFF.includes(item.state);
  return item.state === filter;
}

function count(data: HrmsTeamToday, filter: Filter): number {
  if (filter === "off") return data.counts.holiday + data.counts.week_off;
  return data.counts[filter];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function times(item: Item, timeZone: string): string | null {
  if (item.firstCheckInAt == null) return null;
  const first = `In ${formatClock(item.firstCheckInAt, timeZone)}`;
  return item.lastCheckOutAt == null
    ? first
    : `${first} · Out ${formatClock(item.lastCheckOutAt, timeZone)}`;
}

function TeamToday() {
  const { data } = useSuspenseQuery(hrmsTeamTodayQuery);
  const [filter, setFilter] = useState<Filter>("all");
  if (data.items.length === 0)
    return (
      <HrmsEmpty
        icon={Users}
        title="No Team Members yet"
        description="Add Team Members in Masters → Team Members. Once they join the Company they appear here with today's check-in."
      />
    );
  const items = data.items.filter((item) => matches(item, filter));
  return (
    <section aria-labelledby="hrms-team-today" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="hrms-team-today" className="font-semibold">
          {formatWeekdayDate(data.today)}
        </h3>
        <p className="text-muted-foreground text-sm">
          {data.counts.checked_in + data.counts.checked_out} of{" "}
          {data.counts.all} checked in today
        </p>
      </div>
      <div className="-mx-6 overflow-x-auto px-6 pb-1 [contain:inline-size]">
        <ToggleGroup
          aria-label="Show"
          value={[filter]}
          onValueChange={(value: string[]) => {
            const next = value[0] as Filter | undefined;
            if (next != null) setFilter(next);
          }}
          variant="outline"
          size="sm"
        >
          {FILTERS.map((item) => (
            <ToggleGroupItem
              key={item.value}
              value={item.value}
              className="whitespace-nowrap"
            >
              {item.label}{" "}
              <span className="text-muted-foreground tabular-nums">
                {count(data, item.value)}
              </span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
          Nobody matches this filter.
        </p>
      ) : (
        <ul
          aria-label="Team Members today"
          className="bg-card divide-y rounded-xl border"
        >
          {items.map((item) => {
            const line = times(item, data.timeZone);
            return (
              <li
                key={item.member.memberId}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
              >
                <span
                  aria-hidden="true"
                  className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                >
                  {initials(item.member.name)}
                </span>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-medium">{item.member.name}</p>
                  <p className="text-muted-foreground truncate text-sm">
                    {item.member.designationName ?? "—"}
                    {line == null ? null : ` · ${line}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-end gap-1.5">
                  {item.workedHours > 0 ? (
                    <span className="text-muted-foreground text-sm tabular-nums">
                      {hoursText(item.workedHours)}
                    </span>
                  ) : null}
                  {item.late ? <Badge variant="outline">Late</Badge> : null}
                  {item.outOfFence ? (
                    <Badge variant="outline">Outside fence</Badge>
                  ) : null}
                  {item.openFromEarlierDay ? (
                    <Badge variant="outline">Open from earlier</Badge>
                  ) : null}
                  <LiveStateBadge state={item.state} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/**
 * Team Attendance (CM-309): where each Team Member stands today (checked
 * in, checked out, not checked in, on leave, day off), with late and
 * out-of-fence flags and filter chips. Menu `hrms.attendance` View All.
 */
export function TeamAttendancePage() {
  return (
    <HrmsPage
      title="Team Attendance"
      description="Today's check-ins for everyone you can see."
    >
      <AttendanceRead what="your team's attendance">
        <TeamToday />
      </AttendanceRead>
    </HrmsPage>
  );
}
