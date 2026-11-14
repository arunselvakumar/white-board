"use client";

import { useQuery, useSuspenseInfiniteQuery } from "@tanstack/react-query";
import { LogIn, LogOut } from "lucide-react";
import Link from "next/link";
import { parseAsStringLiteral, useQueryStates } from "nuqs";
import { useMemo, type ReactNode } from "react";

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
import { checkInActivityParts } from "@/app/app/_components/check-in/check-in-activity";
import { formatTime } from "@/app/app/_components/check-in/check-in-entry-parts";
import { projectBasePath } from "@/lib/project-nav";
import {
  PERSON_ACTIVITY_TYPES,
  type PersonActivityEntry,
  type PersonActivityFilter,
  type siteEngineerActivityQuery,
} from "@/src/queries/activity";
import { projectOptionsQuery } from "@/src/queries/projects";

/**
 * What a Labour's, a Site Engineer's and a Vendor's Activity tabs share
 * (ADR CM-0038 §5, CM-0044 §7): the Projects added and removed and the
 * check-in entries in words, the filters kept in the address, and the
 * pages of entries.
 */

type ActivityProject = { id: string; name: string; canOpen: boolean };

/** Shown on a Site Engineer's and a Vendor's empty feed. */
export const PERSON_ACTIVITY_EMPTY =
  "Nothing yet. Projects they are added to, and their check-in entries, will show here.";

/** A Project by name: a link when the viewer may open it. */
export function ProjectName({ project }: { project: ActivityProject }) {
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

/** How a check-in entry's line starts (ADR CM-0044 §2). */
const CHECKED_START: Record<
  Extract<PersonActivityEntry, { kind: "check_in" }>["action"],
  string
> = {
  check_in: "Checked in",
  check_out: "Checked out",
};

/**
 * A Project added or removed, or a check-in entry, in words; times in the
 * Company's time zone. The same on every person's feed.
 */
export function personActivityItem(
  entry: PersonActivityEntry,
  timeZone: string,
): ActivityFeedItem {
  const base = {
    id: entry.id,
    date: entry.date,
    recordedAt: entry.recordedAt,
    by: entry.by,
  };
  switch (entry.kind) {
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

/** The pages read so far, worded by `item`, with Load more. */
export function ActivityPages<Entry>({
  pages,
  item,
  paging,
  emptyMessage,
  now,
}: {
  pages: readonly { items: readonly Entry[]; timeZone: string }[];
  item: (entry: Entry, timeZone: string) => ActivityFeedItem;
  paging: ReturnType<typeof feedPaging>;
  emptyMessage: string;
  now?: Date;
}) {
  const timeZone = pages[0]?.timeZone ?? "Asia/Kolkata";
  return (
    <ActivityFeed
      items={pages.flatMap((page) =>
        page.items.map((entry) => item(entry, timeZone)),
      )}
      timeZone={timeZone}
      emptyMessage={emptyMessage}
      now={now}
      {...paging}
    />
  );
}

const ALL_PROJECTS = "all";

/** A person's feed filters as the address holds them. */
export type PersonActivityTabFilter<Type extends string> = {
  type: Type | "all";
  projectId: string | null;
  from: string | null;
  to: string | null;
};

/**
 * A person's Activity tab: Type, Project and a date range kept in the
 * address, then `children` (the feed for that filter) inside the feed's
 * loading and error states. A new filter starts with a fresh error state.
 */
export function PersonActivityTab<Type extends string>({
  types,
  typeItems,
  children,
}: {
  /** The Type filter's values; "all" is the default. */
  types: readonly (Type | "all")[];
  typeItems: readonly { value: Type | "all"; label: string }[];
  children: (filter: PersonActivityTabFilter<Type>) => ReactNode;
}) {
  // Typed as text: nuqs cannot carry a generic literal through its default.
  const parsers = useMemo(
    () => ({
      type: parseAsStringLiteral<string>(types).withDefault("all"),
      projectId: parseAsUuid,
      from: parseAsCalendarDate,
      to: parseAsCalendarDate,
    }),
    [types],
  );
  const [filters, setFilters] = useQueryStates(parsers);
  const type = filters.type as Type | "all";
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
  const filter: PersonActivityTabFilter<Type> = {
    type,
    projectId: filters.projectId,
    ...orderedRange(filters.from, filters.to),
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ActivityFilterSelect
          label="Type"
          value={type}
          items={typeItems}
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
      <ActivityFeedBoundary key={JSON.stringify(filter)}>
        {children(filter)}
      </ActivityFeedBoundary>
    </div>
  );
}

const PERSON_TYPE_ITEMS = [
  { value: "all", label: "All" },
  { value: "projects", label: "Projects" },
  { value: "check_ins", label: "Check-In" },
] as const;

/** A Site Engineer's or a Vendor's feed for one filter. */
type PersonActivityQuery = (
  filter: PersonActivityFilter,
) => ReturnType<typeof siteEngineerActivityQuery>;

function PersonActivityList({
  query: activityQuery,
  filter,
  now,
}: {
  query: PersonActivityQuery;
  filter: PersonActivityFilter;
  now?: Date;
}) {
  const query = useSuspenseInfiniteQuery(activityQuery(filter));
  return (
    <ActivityPages
      pages={query.data.pages}
      item={personActivityItem}
      paging={feedPaging(query)}
      emptyMessage={PERSON_ACTIVITY_EMPTY}
      now={now}
    />
  );
}

/**
 * A Site Engineer's or a Vendor's Activity tab (ADR CM-0044 §7): the
 * Projects they were added to and removed from, and their check-in
 * entries, filtered by Type (All, Projects, Check-In), Project and dates.
 */
export function PersonActivity({
  query,
  now,
}: {
  query: PersonActivityQuery;
  /** For stories: what "Today" is. */
  now?: Date;
}) {
  return (
    <PersonActivityTab
      types={PERSON_ACTIVITY_TYPES}
      typeItems={PERSON_TYPE_ITEMS}
    >
      {(filter) => (
        <PersonActivityList query={query} filter={filter} now={now} />
      )}
    </PersonActivityTab>
  );
}
