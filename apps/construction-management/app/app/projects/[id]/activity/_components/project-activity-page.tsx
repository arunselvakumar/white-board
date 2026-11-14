"use client";

import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowLeftToLine,
  ArrowRightFromLine,
  HardHat,
  UserMinus,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useQueryStates } from "nuqs";

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
  PROJECT_ACTIVITY_SEARCH,
  projectActivityFilter,
} from "@/app/app/_components/activity/activity-search-params";
import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import {
  CHECKED,
  checkInActivityParts,
} from "@/app/app/_components/check-in/check-in-activity";
import { formatTime } from "@/app/app/_components/check-in/check-in-entry-parts";
import { projectBasePath } from "@/lib/project-nav";
import {
  LABOURS_PAGE_PATH,
  SITE_ENGINEERS_PATH,
  VENDORS_PATH,
} from "@/lib/staff-nav";
import {
  projectActivityQuery,
  type ProjectActivityEntry,
  type ProjectActivityFilter,
  type ProjectActivityType,
  type ProjectActivityWho,
} from "@/src/queries/activity";

type Lines = { detail?: string; more?: ActivityFeedItem["more"] };

type LabourPerson = Extract<
  ProjectActivityEntry,
  { labours: unknown }
>["labours"][number];
type Project = { id: string; name: string; canOpen: boolean };
type CheckInPerson = Extract<
  ProjectActivityEntry,
  { kind: "check_in" }
>["person"];

export const PROJECT_ACTIVITY_EMPTY =
  "Nothing yet. Adding Site Engineers or Labours to this Project will show here.";

export const PROJECT_CHECK_INS_EMPTY =
  "No check-in entries. People checked in or out on Check-In will show here.";

const TYPE_ITEMS: { value: ProjectActivityType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "team", label: "Team changes" },
  { value: "check_ins", label: "Check-In" },
];

const WHO_ITEMS: { value: ProjectActivityWho; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "site_engineers", label: "Site Engineers" },
  { value: "labours", label: "Labours" },
  { value: "vendors", label: "Vendors" },
];

/** Each kind of person's page (ADR CM-0036). */
const PERSON_PAGES: Record<CheckInPerson["kind"], string> = {
  labour: LABOURS_PAGE_PATH,
  site_engineer: SITE_ENGINEERS_PATH,
  vendor: VENDORS_PATH,
};

function personHref(person: CheckInPerson): string | null {
  return person.canOpen
    ? `${PERSON_PAGES[person.kind]}/${encodeURIComponent(person.id)}`
    : null;
}

const LINK = "font-medium underline-offset-4 hover:underline";

function Named({ href, name }: { href: string | null; name: string }) {
  return href == null ? (
    <strong className="font-medium">{name}</strong>
  ) : (
    <Link href={href} className={LINK}>
      {name}
    </Link>
  );
}

function labourHref(labour: LabourPerson): string | null {
  return labour.canOpen
    ? `${LABOURS_PAGE_PATH}/${encodeURIComponent(labour.id)}`
    : null;
}

function ProjectName({ project }: { project: Project | null }) {
  if (project == null) return <strong className="font-medium">—</strong>;
  return (
    <Named
      href={project.canOpen ? projectBasePath(project.id) : null}
      name={project.name}
    />
  );
}

function labourLine(labour: LabourPerson): string {
  return [labour.labourCode, labour.labourCategory]
    .filter((part): part is string => part != null && part !== "")
    .join(" · ");
}

/** Who moved: the Labour's name, or "12 Labours" for a batch. */
function who(labours: readonly LabourPerson[]) {
  const [only] = labours;
  if (labours.length === 1 && only != null)
    return <Named href={labourHref(only)} name={only.name} />;
  return (
    <strong className="font-medium">{`${String(labours.length)} Labours`}</strong>
  );
}

function batch(labours: readonly LabourPerson[]): Lines {
  const [only] = labours;
  if (labours.length === 1 && only != null) {
    const line = labourLine(only);
    return line === "" ? {} : { detail: line };
  }
  return {
    more: {
      label: "Show names",
      content: (
        <ul className="space-y-1">
          {labours.map((labour) => (
            <li key={labour.id}>
              <Named href={labourHref(labour)} name={labour.name} />
              {labourLine(labour) === "" ? null : (
                <span className="text-muted-foreground">
                  {` · ${labourLine(labour)}`}
                </span>
              )}
            </li>
          ))}
        </ul>
      ),
    },
  };
}

function withRemark(parts: Lines, remark: string | null): Lines {
  if (remark == null || remark === "") return parts;
  return {
    ...parts,
    detail: parts.detail == null ? remark : `${parts.detail} · ${remark}`,
  };
}

/** One Project Activity entry in words; times in the Company's time zone. */
export function projectActivityItem(
  entry: ProjectActivityEntry,
  timeZone: string,
): ActivityFeedItem {
  const base = {
    id: entry.id,
    date: entry.date,
    recordedAt: entry.recordedAt,
    by: entry.by,
  };
  switch (entry.kind) {
    case "site_engineer_added":
    case "site_engineer_removed": {
      const person = entry.siteEngineer;
      const href =
        person.canOpen && person.id != null
          ? `${SITE_ENGINEERS_PATH}/${encodeURIComponent(person.id)}`
          : null;
      const added = entry.kind === "site_engineer_added";
      return {
        ...base,
        icon: HardHat,
        tone: added ? "added" : "removed",
        title: (
          <>
            Site Engineer <Named href={href} name={person.name} />{" "}
            {added ? "added" : "removed"}
          </>
        ),
      };
    }
    case "labour_added":
      return {
        ...base,
        icon: UserPlus,
        tone: "added",
        title: <>{who(entry.labours)} added</>,
        ...withRemark(batch(entry.labours), entry.remark),
      };
    case "labour_removed":
      return {
        ...base,
        icon: UserMinus,
        tone: "removed",
        title: <>{who(entry.labours)} removed</>,
        ...withRemark(batch(entry.labours), entry.remark),
      };
    case "transferred_in":
      return {
        ...base,
        icon: ArrowLeftToLine,
        tone: "added",
        title: (
          <>
            {who(entry.labours)} transferred in from{" "}
            <ProjectName project={entry.fromProject} />
          </>
        ),
        ...withRemark(batch(entry.labours), entry.remark),
      };
    case "transferred_out":
      return {
        ...base,
        icon: ArrowRightFromLine,
        tone: "removed",
        title: (
          <>
            {who(entry.labours)} transferred out to{" "}
            <ProjectName project={entry.toProject} />
          </>
        ),
        ...withRemark(batch(entry.labours), entry.remark),
      };
    case "check_in": {
      const { person } = entry;
      const time = formatTime(entry.at, timeZone);
      const said = `${CHECKED[entry.action]} · ${time}`;
      return {
        ...base,
        ...checkInActivityParts(entry, `${person.name} ${said}`),
        title: (
          <>
            <Named href={personHref(person)} name={person.name} /> {said}
            {person.role == null ? null : (
              <span className="text-muted-foreground"> · {person.role}</span>
            )}
          </>
        ),
      };
    }
  }
}

function ProjectActivityList({
  projectId,
  filter,
  now,
}: {
  projectId: string;
  filter: ProjectActivityFilter;
  now?: Date;
}) {
  const query = useSuspenseInfiniteQuery(
    projectActivityQuery(projectId, filter),
  );
  const timeZone = query.data.pages[0]?.timeZone ?? "Asia/Kolkata";
  const items = query.data.pages.flatMap((page) =>
    page.items.map((entry) => projectActivityItem(entry, timeZone)),
  );
  return (
    <ActivityFeed
      items={items}
      timeZone={timeZone}
      emptyMessage={
        filter.type === "check_ins"
          ? PROJECT_CHECK_INS_EMPTY
          : PROJECT_ACTIVITY_EMPTY
      }
      now={now}
      {...feedPaging(query)}
    />
  );
}

/**
 * A Project's Activity (ADR CM-0038 §4): Site Engineers and Labours added,
 * removed and transferred, and each Check In and Check Out (ADR CM-0044),
 * filtered by Type, Who and dates kept in the address.
 */
export function ProjectActivityPage({
  projectId,
  now,
}: {
  projectId: string;
  /** For stories: what "Today" is. */
  now?: Date;
}) {
  const [search, setSearch] = useQueryStates(PROJECT_ACTIVITY_SEARCH);
  const filter = projectActivityFilter(search);
  return (
    <div className="w-full max-w-4xl space-y-6 p-6">
      <PageHeader
        title="Activity"
        meta="Site Engineers and Labours added, removed and transferred, and who checked in and out."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ActivityFilterSelect
          label="Type"
          value={search.type}
          items={TYPE_ITEMS}
          onChange={(value) => {
            void setSearch({ type: value === "all" ? null : value });
          }}
        />
        <ActivityFilterSelect
          label="Who"
          value={search.who}
          items={WHO_ITEMS}
          onChange={(value) => {
            void setSearch({ who: value === "all" ? null : value });
          }}
        />
        <ActivityDateRange
          from={search.from}
          to={search.to}
          onChange={(next) => {
            void setSearch(next);
          }}
        />
      </div>
      {/* A new filter starts with a fresh error state. */}
      <ActivityFeedBoundary key={JSON.stringify(filter)}>
        <ProjectActivityList projectId={projectId} filter={filter} now={now} />
      </ActivityFeedBoundary>
    </div>
  );
}
