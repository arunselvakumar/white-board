"use client";

import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";

import {
  feedPaging,
  type ActivityFeedItem,
} from "@/app/app/_components/activity/activity-feed";
import {
  ActivityPages,
  PersonActivityTab,
  ProjectName,
  personActivityItem,
} from "@/app/app/_components/activity/person-activity";
import {
  EMPLOYEE_ACTIVITY_TYPES,
  employeeActivityQuery,
  type EmployeeActivityEntry,
  type EmployeeActivityFilter,
  type EmployeeActivityType,
} from "@/src/queries/activity";

type Status = Extract<EmployeeActivityEntry, { kind: "attendance" }>["status"];

/** As on the attendance sheet. */
const STATUS_LABELS: Record<Status, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
  on_leave: "On Leave",
  paid_leave: "Paid Leave",
  holiday: "Holiday",
};

const TYPE_ITEMS: { value: EmployeeActivityType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "projects", label: "Projects" },
  { value: "attendance", label: "Attendance" },
  { value: "check_ins", label: "Check-In" },
  { value: "profile", label: "Profile" },
];

export const EMPLOYEE_ACTIVITY_EMPTY =
  "Nothing yet. Adding this Employee to a Project or marking attendance will show here.";

function attendanceDetail(
  entry: Extract<EmployeeActivityEntry, { kind: "attendance" }>,
): string | undefined {
  const parts = [
    entry.checkIn == null
      ? null
      : `${entry.checkIn} – ${entry.checkOut ?? "…"}`,
    entry.overtimeHours == null ? null : `Overtime ${entry.overtimeHours} h`,
    entry.shift,
  ].filter((part): part is string => part != null && part !== "");
  return parts.length === 0 ? undefined : parts.join(" · ");
}

/** One Employee Activity entry in words; times in the Company's time zone. */
export function employeeActivityItem(
  entry: EmployeeActivityEntry,
  timeZone: string,
): ActivityFeedItem {
  const base = {
    id: entry.id,
    date: entry.date,
    recordedAt: entry.recordedAt,
    by: entry.by,
  };
  switch (entry.kind) {
    case "added":
      return {
        ...base,
        icon: UserPlus,
        tone: "added",
        title: "Added to Employees",
        detail: entry.imported ? "Imported from Excel" : undefined,
      };
    case "activated":
      return { ...base, icon: UserCheck, title: "Marked active" };
    case "deactivated":
      return {
        ...base,
        icon: UserX,
        tone: "removed",
        title: "Marked inactive",
      };
    case "project_added":
    case "project_removed":
    case "check_in":
      return personActivityItem(entry, timeZone);
    case "transferred":
      return {
        ...base,
        icon: ArrowRightLeft,
        title: (
          <>
            Transferred from <ProjectName project={entry.fromProject} /> to{" "}
            <ProjectName project={entry.toProject} />
          </>
        ),
        detail: entry.remark ?? undefined,
      };
    case "attendance":
      return {
        ...base,
        icon: CalendarCheck,
        title: (
          <>
            <strong className="font-medium">
              {STATUS_LABELS[entry.status]}
            </strong>{" "}
            at <ProjectName project={entry.project} />
          </>
        ),
        detail: attendanceDetail(entry),
      };
    case "attendance_changed":
      return {
        ...base,
        icon: CalendarClock,
        title: (
          <>
            Attendance at <ProjectName project={entry.project} /> changed from{" "}
            {STATUS_LABELS[entry.fromStatus]} to {STATUS_LABELS[entry.toStatus]}
          </>
        ),
      };
    case "attendance_cleared":
      return {
        ...base,
        icon: CalendarX,
        tone: "removed",
        title: (
          <>
            Attendance at <ProjectName project={entry.project} /> cleared
          </>
        ),
        detail: `It was ${STATUS_LABELS[entry.status]}.`,
      };
  }
}

function EmployeeActivityList({
  employeeId,
  filter,
  now,
}: {
  employeeId: string;
  filter: EmployeeActivityFilter;
  now?: Date;
}) {
  const query = useSuspenseInfiniteQuery(
    employeeActivityQuery(employeeId, filter),
  );
  return (
    <ActivityPages
      pages={query.data.pages}
      item={employeeActivityItem}
      paging={feedPaging(query)}
      emptyMessage={EMPLOYEE_ACTIVITY_EMPTY}
      now={now}
    />
  );
}

/**
 * The Employee page's Activity tab (ADR CM-0038 §5): Project moves,
 * attendance, check-in entries (ADR CM-0044) and profile entries,
 * filtered by Type, Project and dates kept in the address.
 */
export function EmployeeActivity({
  employeeId,
  now,
}: {
  employeeId: string;
  /** For stories: what "Today" is. */
  now?: Date;
}) {
  return (
    <PersonActivityTab types={EMPLOYEE_ACTIVITY_TYPES} typeItems={TYPE_ITEMS}>
      {(filter) => (
        <EmployeeActivityList
          employeeId={employeeId}
          filter={filter}
          now={now}
        />
      )}
    </PersonActivityTab>
  );
}
