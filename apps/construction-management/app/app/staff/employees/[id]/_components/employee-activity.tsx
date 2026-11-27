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
  LABOUR_ACTIVITY_TYPES,
  labourActivityQuery,
  type LabourActivityEntry,
  type LabourActivityFilter,
  type LabourActivityType,
} from "@/src/queries/activity";

type Status = Extract<LabourActivityEntry, { kind: "attendance" }>["status"];

/** As on the attendance sheet. */
const STATUS_LABELS: Record<Status, string> = {
  present: "Present",
  half_day: "Half Day",
  absent: "Absent",
  on_leave: "On Leave",
  paid_leave: "Paid Leave",
  holiday: "Holiday",
};

const TYPE_ITEMS: { value: LabourActivityType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "projects", label: "Projects" },
  { value: "attendance", label: "Attendance" },
  { value: "check_ins", label: "Check-In" },
  { value: "profile", label: "Profile" },
];

export const LABOUR_ACTIVITY_EMPTY =
  "Nothing yet. Adding this Labour to a Project or marking attendance will show here.";

function attendanceDetail(
  entry: Extract<LabourActivityEntry, { kind: "attendance" }>,
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

/** One Labour Activity entry in words; times in the Company's time zone. */
export function labourActivityItem(
  entry: LabourActivityEntry,
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
        title: "Added to Labours",
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

function LabourActivityList({
  labourId,
  filter,
  now,
}: {
  labourId: string;
  filter: LabourActivityFilter;
  now?: Date;
}) {
  const query = useSuspenseInfiniteQuery(labourActivityQuery(labourId, filter));
  return (
    <ActivityPages
      pages={query.data.pages}
      item={labourActivityItem}
      paging={feedPaging(query)}
      emptyMessage={LABOUR_ACTIVITY_EMPTY}
      now={now}
    />
  );
}

/**
 * The Labour page's Activity tab (ADR CM-0038 §5): Project moves,
 * attendance, check-in entries (ADR CM-0044) and profile entries,
 * filtered by Type, Project and dates kept in the address.
 */
export function LabourActivity({
  labourId,
  now,
}: {
  labourId: string;
  /** For stories: what "Today" is. */
  now?: Date;
}) {
  return (
    <PersonActivityTab types={LABOUR_ACTIVITY_TYPES} typeItems={TYPE_ITEMS}>
      {(filter) => (
        <LabourActivityList labourId={labourId} filter={filter} now={now} />
      )}
    </PersonActivityTab>
  );
}
