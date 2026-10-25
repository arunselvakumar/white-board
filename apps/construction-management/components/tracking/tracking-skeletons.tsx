import { GanttChart, ListTree } from "lucide-react";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";

import {
  FilterBarSkeleton,
  ResponsiveListSkeleton,
} from "@/components/procurement/procurement-skeletons";
import { SiteRecordHeaderSkeleton } from "@/components/site-work/site-work-skeletons";

/*
 * Tracking while it loads (ADR-0047): Issues & Snags, Inspection
 * Requests and Tasks. Status chips and headings whose words are in code
 * render for real; filter options and rows come with the data.
 */

const WIDTHS = ["62%", "48%", "71%", "55%", "40%"];

const SELECT: SkeletonColumn = {
  header: <span className="sr-only">Select</span>,
  kind: "checkbox",
  className: "w-10",
};

/** The Issues filter bar while its options load. */
export function IssueFiltersSkeleton() {
  return (
    <FilterBarSkeleton
      className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end"
      labels={[
        "Priority",
        "Category",
        "Assigned to",
        "Department",
        "Contractor",
        "Date",
        "Search",
      ]}
    />
  );
}

/** Issues & Snags: the count, then a table from `md` and cards below. */
export function IssueRowsSkeleton({ selecting }: { selecting: boolean }) {
  return (
    <ResponsiveListSkeleton
      className="min-w-0"
      label="Loading issues"
      lines={2}
      columns={[
        ...(selecting ? [SELECT] : []),
        { header: "Number" },
        { header: "Details", kind: "muted", className: "max-w-72" },
        { header: "Priority", kind: "badge" },
        { header: "Assigned to", kind: "muted" },
        { header: "Issue Date", kind: "muted" },
        { header: "Due Date", kind: "muted" },
        { header: "Status", kind: "badge" },
      ]}
    />
  );
}

/** The Inspection Requests filter bar while its options load. */
export function InspectionFiltersSkeleton() {
  return (
    <FilterBarSkeleton
      labels={["Department", "Contractor", "Inspector", "Date"]}
    />
  );
}

/** Inspection Requests: status tabs with counts, the count, the rows. */
export function InspectionRowsSkeleton({ bulk }: { bulk: boolean }) {
  return (
    <div className="min-w-0 space-y-3">
      <div
        aria-hidden="true"
        className="flex h-10 max-w-full items-center gap-6 overflow-hidden px-3"
      >
        {["3rem", "8.5rem", "5.5rem", "5.5rem"].map((width) => (
          <div key={width} className="flex shrink-0 items-center gap-2">
            <Skeleton className="size-4 rounded-sm" />
            <Skeleton className="h-3.5 rounded-md" style={{ width }} />
          </div>
        ))}
      </div>
      <ResponsiveListSkeleton
        label="Loading Inspection Requests"
        lines={2}
        columns={[
          ...(bulk ? [SELECT] : []),
          { header: "Request No" },
          { header: "Inspection", kind: "muted" },
          { header: "Work", kind: "muted" },
          { header: "Contractor", kind: "muted" },
          { header: "Inspector", kind: "muted" },
          { header: "Status", kind: "badge" },
        ]}
      />
    </div>
  );
}

/** Updates on an issue or task: who and when, then the text. */
export function UpdatesSkeleton({
  label = "Loading updates",
  rows = 2,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <SkeletonGroup label={label} className="block">
      <ul className="space-y-2">
        {WIDTHS.slice(0, rows).map((width) => (
          <li key={width} className="min-w-0 space-y-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <SkeletonText width="7rem" />
              <SkeletonText size="xs" width="5rem" />
            </div>
            <SkeletonText width={width} />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** An activity or history feed: a line and who and when, on a left rule. */
export function FeedSkeleton({
  label = "Loading activity",
}: {
  label?: string;
}) {
  return (
    <SkeletonGroup label={label} className="block">
      <ol className="space-y-2 border-l pl-4">
        {WIDTHS.slice(0, 3).map((width) => (
          <li key={width}>
            <SkeletonText width={width} />
            <SkeletonText size="xs" width="9rem" />
          </li>
        ))}
      </ol>
    </SkeletonGroup>
  );
}

/** The facts grid of a tracking record; the first fact spans the row. */
function FactsSkeleton({
  facts,
  className = "grid gap-4 rounded-lg border p-4 sm:grid-cols-3",
  wideFirst = true,
}: {
  facts: string[];
  className?: string;
  wideFirst?: boolean;
}) {
  return (
    <dl className={className}>
      {facts.map((fact, index) => (
        <div
          key={fact}
          className={cn("min-w-0", wideFirst && index === 0 && "sm:col-span-3")}
        >
          <dt className="text-muted-foreground text-xs">{fact}</dt>
          <dd className="mt-0.5">
            <SkeletonText width={WIDTHS[index % WIDTHS.length]} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

const trackingHref = (projectId: string, segment: string) =>
  `/app/projects/${encodeURIComponent(projectId)}/${segment}`;

/** An issue's page: number and dates, its facts, then Progress. */
export function IssueDetailSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <SiteRecordHeaderSkeleton
        size="detail"
        back={{
          label: "Issues & Snags",
          href: trackingHref(projectId, "issues"),
        }}
      />
      <SkeletonGroup
        label="Loading issue"
        className="block w-full max-w-4xl min-w-0 space-y-6"
      >
        <FactsSkeleton
          facts={[
            "Details",
            "Issue Date",
            "Due Date",
            "Priority",
            "Category",
            "Department",
            "Contractor",
            "Assigned to",
            "Location",
            "Created By",
          ]}
        />
      </SkeletonGroup>
    </div>
  );
}

/** An Inspection Request's page: number and when, then its facts. */
export function InspectionDetailSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <SiteRecordHeaderSkeleton
        size="detail"
        back={{
          label: "Inspection Requests",
          href: trackingHref(projectId, "inspections"),
        }}
      />
      <SkeletonGroup
        label="Loading Inspection Request"
        className="block w-full max-w-4xl min-w-0 space-y-6"
      >
        <FactsSkeleton
          facts={[
            "Description of work",
            "Inspection",
            "Inspector",
            "Contractor",
            "Department",
            "Location",
            "Raised by",
          ]}
        />
      </SkeletonGroup>
    </div>
  );
}

/** A task's page: the summary with status and progress, its dates and facts. */
export function TaskDetailSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-6 p-6">
      <SiteRecordHeaderSkeleton
        size="detail"
        back={{ label: "Tasks", href: trackingHref(projectId, "tasks") }}
      />
      <SkeletonGroup label="Loading task" className="block space-y-6">
        <section className="bg-card min-w-0 space-y-4 rounded-lg border p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Skeleton className="h-5 w-20 rounded-full" />
            <Skeleton className="h-2 min-w-40 flex-1 rounded-full" />
          </div>
          <FactsSkeleton
            wideFirst={false}
            className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
            facts={[
              "Planned",
              "Actual",
              "Variance",
              "Assigned to",
              "Priority",
              "Department",
              "Contractor",
              "Tags",
            ]}
          />
        </section>
        <section className="min-w-0 space-y-3">
          <h3 className="text-sm font-semibold">Activity</h3>
          <FeedSkeleton />
        </section>
      </SkeletonGroup>
    </div>
  );
}

/** The task filter bar while its options load: search, status, More. */
export function TaskFilterBarSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <Skeleton className="h-10 w-full rounded-lg sm:w-56" />
      <Skeleton className="h-10 w-full rounded-lg sm:w-44" />
      <Skeleton className="h-10 w-28 rounded-lg" />
    </div>
  );
}

const TASK_INDENTS = [0, 1.5, 1.5, 0, 1.5];

/** The task tree: the count, then nested task cards. */
export function TaskTreeSkeleton() {
  return (
    <SkeletonGroup label="Loading tasks" className="block space-y-3">
      <div className="flex min-h-8 items-center">
        <SkeletonText width="5rem" />
      </div>
      <ul className="space-y-2">
        {TASK_INDENTS.map((indent, row) => (
          <li
            key={row}
            className="bg-card flex min-w-0 gap-2 rounded-lg border p-3"
            style={{ marginLeft: `${String(indent)}rem` }}
          >
            <Skeleton className="mt-0.5 size-4 shrink-0 rounded-sm" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <SkeletonText
                  width={WIDTHS[row % WIDTHS.length]}
                  className="max-w-72"
                />
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
              <SkeletonText size="xs" width="40%" />
              <Skeleton className="h-2 w-full max-w-sm rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** The Gantt: the scale chips, then task names beside bars. */
export function TaskGanttSkeleton() {
  return (
    <SkeletonGroup label="Loading Gantt" className="block space-y-3">
      <div className="flex gap-1">
        {["Day", "Week", "Month"].map((scale) => (
          <Skeleton key={scale} className="h-7 w-14 rounded-lg" />
        ))}
      </div>
      <div className="bg-card overflow-hidden rounded-lg border">
        <div className="flex">
          <ul className="w-48 shrink-0 border-r pt-10">
            {WIDTHS.map((width) => (
              <li key={width} className="flex h-9 items-center border-t px-2">
                <SkeletonText width={width} />
              </li>
            ))}
          </ul>
          <div className="min-w-0 flex-1 pt-10">
            {[
              ["5%", "35%"],
              ["10%", "20%"],
              ["25%", "30%"],
              ["40%", "45%"],
              ["55%", "25%"],
            ].map(([left, width]) => (
              <div key={left} className="relative h-9 border-t">
                <Skeleton
                  className="absolute top-2.5 h-4 rounded-sm"
                  style={{ left, width }}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkeletonGroup>
  );
}

/** The Tasks page while the viewer's rights load: heading, filters, tabs. */
export function TasksPageSkeleton({
  initialView = "list",
}: {
  initialView?: "list" | "gantt";
}) {
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <h2 className="font-semibold">Tasks</h2>
      <TaskFilterBarSkeleton />
      <Tabs defaultValue={initialView} className="min-w-0 gap-4">
        <TabsList>
          <TabsTrigger value="list" disabled={initialView !== "list"}>
            <ListTree aria-hidden="true" />
            List
          </TabsTrigger>
          <TabsTrigger value="gantt" disabled={initialView !== "gantt"}>
            <GanttChart aria-hidden="true" />
            Gantt
          </TabsTrigger>
        </TabsList>
        {initialView === "list" ? <TaskTreeSkeleton /> : <TaskGanttSkeleton />}
      </Tabs>
    </div>
  );
}

const ISSUE_FIELDS = [
  { label: "Issue Date" },
  { label: "Priority", control: "select" },
  { label: "Due Date" },
  { label: "Details", control: "textarea", wide: true },
  { label: "Category", control: "select" },
  { label: "Department", control: "select" },
  { label: "Contractor", control: "select" },
  { label: "Assign To", control: "select" },
] as const;

const INSPECTION_FIELDS = [
  { label: "Inspection Date" },
  { label: "Inspection Time" },
  { label: "Inspector", control: "select" },
  { label: "Department", control: "select" },
  { label: "Contractor", control: "select" },
  { label: "Description of work", control: "textarea", wide: true },
] as const;

const TASK_FIELDS = [
  { label: "Task name", wide: true },
  { label: "Description", control: "textarea", wide: true },
  { label: "Assign to", control: "select" },
  { label: "Priority", control: "select" },
  { label: "Start Date" },
  { label: "Due Date" },
  { label: "Department", control: "select" },
  { label: "Contractor", control: "select" },
] as const;

const FORM_FIELDS = {
  issue: ISSUE_FIELDS,
  inspection: INSPECTION_FIELDS,
  task: TASK_FIELDS,
};

const FORM_BACK = {
  issue: { label: "Issues & Snags", segment: "issues" },
  inspection: { label: "Inspection Requests", segment: "inspections" },
  task: { label: "Tasks", segment: "tasks" },
};

/**
 * Add or Edit an issue, Inspection Request or task while its options
 * (and the record) load. The title is real when it is known.
 */
export function TrackingFormSkeleton({
  kind,
  projectId,
  title,
}: {
  kind: keyof typeof FORM_FIELDS;
  projectId: string;
  /** "Add Issue"; left out on Edit, where it carries the number. */
  title?: string;
}) {
  const back = FORM_BACK[kind];
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div className="flex w-full max-w-4xl flex-col gap-4">
        <SiteRecordHeaderSkeleton
          back={{
            label: back.label,
            href: trackingHref(projectId, back.segment),
          }}
          title={title}
        />
        <FormSkeleton
          columns={2}
          label={`Loading ${kind} form`}
          fields={[...FORM_FIELDS[kind]]}
        />
      </div>
    </div>
  );
}

/** A tracking form's fields alone, under a header that is already real. */
export function TrackingFormFieldsSkeleton({
  kind,
}: {
  kind: keyof typeof FORM_FIELDS;
}) {
  return (
    <FormSkeleton
      className="w-full max-w-4xl"
      columns={2}
      label={`Loading ${kind} form`}
      fields={[...FORM_FIELDS[kind]]}
    />
  );
}
