"use client";

import { useQuery, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  CalendarCheck,
  CalendarClock,
  CalendarX,
  LogIn,
  LogOut,
  UserCheck,
  UserPlus,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryStates } from "nuqs";

import {
  ActivityFeed,
  ActivityFeedBoundary,
  feedPaging,
  type ActivityFeedItem,
} from "@/app/app/_components/activity/activity-feed";
import {
  ActivityDateRange,
  ActivityFilterSelect,
} from "@/app/app/_components/activity/activity-filters";
import {
  orderedRange,
  parseAsCalendarDate,
  parseAsUuid,
} from "@/app/app/_components/activity/activity-search-params";
import {
  checkInActivityParts,
  type ActivityCheckInEntry,
} from "@/app/app/_components/check-in/check-in-activity";
import { formatTime } from "@/app/app/_components/check-in/check-in-entry-parts";
import { projectBasePath } from "@/lib/project-nav";
import {
  LABOUR_ACTIVITY_TYPES,
  labourActivityQuery,
  type LabourActivityEntry,
  type LabourActivityFilter,
  type LabourActivityType,
} from "@/src/queries/activity";
import { projectOptionsQuery } from "@/src/queries/projects";

type ActivityProject = { id: string; name: string; canOpen: boolean };
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

const ALL_PROJECTS = "all";

export const LABOUR_ACTIVITY_EMPTY =
  "Nothing yet. Adding this Labour to a Project or marking attendance will show here.";

/** The Activity tab's filters, kept in the address. */
const FILTERS = {
  type: parseAsStringLiteral(LABOUR_ACTIVITY_TYPES).withDefault("all"),
  projectId: parseAsUuid,
  from: parseAsCalendarDate,
  to: parseAsCalendarDate,
};

function ProjectName({ project }: { project: ActivityProject }) {
  return project.canOpen ? (
    <Link
      href={projectBasePath(project.id)}
      className="font-medium underline-offset-4 hover:underline"
    >
      {project.name}
    </Link>
  ) : (
    <strong className="font-medium">{project.name}</strong>
  );
}

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

/** How a check-in entry's line starts (ADR CM-0044 §2). */
const CHECKED_START: Record<ActivityCheckInEntry["action"], string> = {
  check_in: "Checked in",
  check_out: "Checked out",
};

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
      return {
        ...base,
        icon: LogIn,
        tone: "added",
        title: (
          <>
            Added to <ProjectName project={entry.project} />
          </>
        ),
        detail: entry.remark ?? undefined,
      };
    case "project_removed":
      return {
        ...base,
        icon: LogOut,
        tone: "removed",
        title: (
          <>
            Removed from <ProjectName project={entry.project} />
          </>
        ),
        detail: entry.remark ?? undefined,
      };
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
    case "check_in": {
      const time = formatTime(entry.at, timeZone);
      return {
        ...base,
        ...checkInActivityParts(
          entry,
          `${CHECKED_START[entry.action]} at ${entry.project.name} · ${time}`,
        ),
        title: (
          <>
            <strong className="font-medium">
              {CHECKED_START[entry.action]}
            </strong>{" "}
            at <ProjectName project={entry.project} /> · {time}
          </>
        ),
      };
    }
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
  const timeZone = query.data.pages[0]?.timeZone ?? "Asia/Kolkata";
  const items = query.data.pages.flatMap((page) =>
    page.items.map((entry) => labourActivityItem(entry, timeZone)),
  );
  return (
    <ActivityFeed
      items={items}
      timeZone={timeZone}
      emptyMessage={LABOUR_ACTIVITY_EMPTY}
      now={now}
      {...feedPaging(query)}
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
  const [filters, setFilters] = useQueryStates(FILTERS);
  const projects = useQuery(projectOptionsQuery);
  const projectItems = [
    { value: ALL_PROJECTS, label: "All Projects" },
    ...(projects.data?.items ?? []).map((project) => ({
      value: project.id,
      label: project.name,
    })),
  ];
  if (
    filters.projectId != null &&
    !projectItems.some((item) => item.value === filters.projectId)
  )
    projectItems.push({ value: filters.projectId, label: "This Project" });
  const range = orderedRange(filters.from, filters.to);
  const filter: LabourActivityFilter = {
    type: filters.type,
    projectId: filters.projectId,
    from: range.from,
    to: range.to,
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ActivityFilterSelect
          label="Type"
          value={filters.type}
          items={TYPE_ITEMS}
          onChange={(type) => {
            void setFilters({ type: type === "all" ? null : type });
          }}
        />
        <ActivityFilterSelect
          label="Project"
          value={filters.projectId ?? ALL_PROJECTS}
          items={projectItems}
          onChange={(projectId) => {
            void setFilters({
              projectId: projectId === ALL_PROJECTS ? null : projectId,
            });
          }}
        />
        <ActivityDateRange
          from={filters.from}
          to={filters.to}
          onChange={(next) => {
            void setFilters(next);
          }}
        />
      </div>
      {/* A new filter starts with a fresh error state. */}
      <ActivityFeedBoundary key={JSON.stringify(filter)}>
        <LabourActivityList labourId={labourId} filter={filter} now={now} />
      </ActivityFeedBoundary>
    </div>
  );
}
