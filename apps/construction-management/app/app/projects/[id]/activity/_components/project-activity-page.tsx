"use client";

import { useSuspenseInfiniteQuery } from "@tanstack/react-query";
import {
  ArrowLeftToLine,
  ArrowRightFromLine,
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
import {
  projectActivityQuery,
  type ProjectActivityEntry,
  type ProjectActivityFilter,
  type ProjectActivityType,
  type ProjectActivityWho,
} from "@/src/queries/activity";
import { type AppHref, pageHref } from "@/lib/page-href";

type Lines = { detail?: string; more?: ActivityFeedItem["more"] };

type EmployeePerson = Extract<
  ProjectActivityEntry,
  { employees: unknown }
>["employees"][number];
type Project = { id: string; name: string; canOpen: boolean };
type CheckInPerson = Extract<
  ProjectActivityEntry,
  { kind: "check_in" }
>["person"];

export const PROJECT_ACTIVITY_EMPTY =
  "Nothing yet. Adding Employees to this Project will show here.";

export const PROJECT_CHECK_INS_EMPTY =
  "No check-in entries. People checked in or out on Check-In will show here.";

const TYPE_ITEMS: { value: ProjectActivityType; label: string }[] = [
  { value: "all", label: "All" },
  { value: "team", label: "Team changes" },
  { value: "check_ins", label: "Check-In" },
];

const WHO_ITEMS: { value: ProjectActivityWho; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "employees", label: "Employees" },
  { value: "vendors", label: "Vendors" },
];

/** An Employee's page (ADR CM-0055 §5). */
function employeePage(id: string): AppHref {
  return pageHref("/app/staff/employees/[id]", { id });
}

/** Each kind of person's page. */
function personPage(kind: CheckInPerson["kind"], id: string): AppHref {
  switch (kind) {
    case "employee":
      return employeePage(id);
    case "vendor":
      return pageHref("/app/staff/vendors/[id]", { id });
  }
}

function personHref(person: CheckInPerson): AppHref | null {
  return person.canOpen ? personPage(person.kind, person.id) : null;
}

const LINK = "font-medium underline-offset-4 hover:underline";

function Named({ href, name }: { href: AppHref | null; name: string }) {
  return href == null ? (
    <strong className="font-medium">{name}</strong>
  ) : (
    <Link href={href} className={LINK}>
      {name}
    </Link>
  );
}

function employeeHref(employee: EmployeePerson): AppHref | null {
  return employee.canOpen ? employeePage(employee.id) : null;
}

function ProjectName({ project }: { project: Project | null }) {
  if (project == null) return <strong className="font-medium">—</strong>;
  return (
    <Named
      href={
        project.canOpen
          ? pageHref("/app/projects/[id]", { id: project.id })
          : null
      }
      name={project.name}
    />
  );
}

function employeeLine(employee: EmployeePerson): string {
  return [employee.employeeCode, employee.role]
    .filter((part): part is string => part != null && part !== "")
    .join(" · ");
}

/** Who moved: the Employee's name, or "12 Employees" for a batch. */
function who(employees: readonly EmployeePerson[]) {
  const [only] = employees;
  if (employees.length === 1 && only != null)
    return <Named href={employeeHref(only)} name={only.name} />;
  return (
    <strong className="font-medium">{`${String(employees.length)} Employees`}</strong>
  );
}

function batch(employees: readonly EmployeePerson[]): Lines {
  const [only] = employees;
  if (employees.length === 1 && only != null) {
    const line = employeeLine(only);
    return line === "" ? {} : { detail: line };
  }
  return {
    more: {
      label: "Show names",
      content: (
        <ul className="space-y-1">
          {employees.map((employee) => (
            <li key={employee.id}>
              <Named href={employeeHref(employee)} name={employee.name} />
              {employeeLine(employee) === "" ? null : (
                <span className="text-muted-foreground">
                  {` · ${employeeLine(employee)}`}
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
    case "employee_added":
      return {
        ...base,
        icon: UserPlus,
        tone: "added",
        title: <>{who(entry.employees)} added</>,
        ...withRemark(batch(entry.employees), entry.remark),
      };
    case "employee_removed":
      return {
        ...base,
        icon: UserMinus,
        tone: "removed",
        title: <>{who(entry.employees)} removed</>,
        ...withRemark(batch(entry.employees), entry.remark),
      };
    case "transferred_in":
      return {
        ...base,
        icon: ArrowLeftToLine,
        tone: "added",
        title: (
          <>
            {who(entry.employees)} transferred in from{" "}
            <ProjectName project={entry.fromProject} />
          </>
        ),
        ...withRemark(batch(entry.employees), entry.remark),
      };
    case "transferred_out":
      return {
        ...base,
        icon: ArrowRightFromLine,
        tone: "removed",
        title: (
          <>
            {who(entry.employees)} transferred out to{" "}
            <ProjectName project={entry.toProject} />
          </>
        ),
        ...withRemark(batch(entry.employees), entry.remark),
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
 * A Project's Activity (ADR CM-0038 §4): Employees added,
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
        meta="Employees added, removed and transferred, and who checked in and out."
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
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
