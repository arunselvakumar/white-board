import { ArrowLeft, ListTodo } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  SkeletonGroup,
  SkeletonText,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";

import {
  FilterBarSkeleton,
  ResponsiveListSkeleton,
} from "@/components/finance/finance-skeletons";
import {
  FieldGridSkeleton,
  FormActionsSkeleton,
  RecordHeaderSkeleton,
  type SalesSkeletonField,
} from "@/components/sales/sales-form-skeletons";
import { inquiriesPath } from "@/src/queries/sales-inquiries";
import {
  FOLLOW_UP_DUE_LABELS,
  FOLLOW_UP_DUES,
  INQUIRY_STATUS_LABELS,
  INQUIRY_STATUSES,
} from "@/src/sales/domain/sales-terms";

/*
 * Inquiries while they load (ADR-0047): the real heading, chips, filter
 * labels, column headers and form labels; bars where the inquiries go.
 */

const WIDTHS = ["62%", "48%", "70%", "55%", "66%"];

export const INQUIRY_COLUMNS: SkeletonColumn[] = [
  { header: "Name" },
  { header: "Interest", kind: "badge" },
  { header: "Funnel Stage", kind: "muted" },
  { header: "Next follow-up", kind: "muted" },
  { header: "Assignee", kind: "muted" },
  { header: "Status", kind: "badge" },
];

const FILTERS = [
  "Funnel Stage",
  "Interest Type",
  "Lead Source",
  "Assignee",
  "Search",
];

/** The Funnel Stage, Interest Type, Lead Source, Assignee and search filters. */
export function InquiryFilterBarSkeleton() {
  return (
    <SkeletonGroup label="Loading filters">
      <FilterBarSkeleton
        size="sm"
        filters={FILTERS}
        className="grid min-w-0 grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end"
      />
    </SkeletonGroup>
  );
}

export function InquiryRowsSkeleton() {
  return (
    <ResponsiveListSkeleton
      label="Loading inquiries"
      count
      columns={INQUIRY_COLUMNS}
    />
  );
}

function Chips({ labels }: { labels: string[] }) {
  return (
    <div className="flex flex-wrap gap-0">
      {labels.map((label, index) => (
        <span
          key={label}
          className={`border-input text-muted-foreground inline-flex h-7 items-center border px-2.5 text-sm ${index === 0 ? "rounded-l-md" : "-ml-px"} ${index === labels.length - 1 ? "rounded-r-md" : ""}`}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * The inquiries page before it can read `?due=`: the real heading, the
 * status and follow-up chips, the filters and the rows.
 */
export function InquiriesListSkeleton() {
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Inquiries</h2>
      </div>
      <div aria-hidden="true" className="flex min-w-0 flex-wrap gap-2">
        <Chips labels={INQUIRY_STATUSES.map((s) => INQUIRY_STATUS_LABELS[s])} />
        <Chips labels={FOLLOW_UP_DUES.map((d) => FOLLOW_UP_DUE_LABELS[d])} />
      </div>
      <InquiryFilterBarSkeleton />
      <InquiryRowsSkeleton />
    </div>
  );
}

/** The follow-ups and history timeline. */
export function TimelineSkeleton() {
  return (
    <SkeletonGroup label="Loading follow-ups">
      <ol className="space-y-2">
        {WIDTHS.slice(0, 3).map((width, row) => (
          <li key={row} className="border-l-2 py-1 pl-3">
            <SkeletonText width={width} />
            <SkeletonText size="xs" width="35%" />
          </li>
        ))}
      </ol>
    </SkeletonGroup>
  );
}

/** The inquiry's own to-dos, under the real Tasks heading. */
export function InquiryTasksSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3
          id="inquiry-tasks"
          className="flex items-center gap-2 text-sm font-semibold"
        >
          <ListTodo
            aria-hidden="true"
            className="text-muted-foreground size-4"
          />
          Tasks
        </h3>
      </div>
      <SkeletonGroup label="Loading tasks">
        <ul className="divide-y">
          {WIDTHS.slice(0, 3).map((width, row) => (
            <li key={row} className="flex items-start gap-3 py-2">
              <Skeleton className="mt-0.5 size-4 shrink-0 rounded-[4px]" />
              <span className="min-w-0 flex-1">
                <SkeletonText width={width} />
                <SkeletonText size="xs" width="40%" />
              </span>
            </li>
          ))}
        </ul>
      </SkeletonGroup>
    </div>
  );
}

const FACTS = [
  "Mobile",
  "Email",
  "Occupation",
  "Interested In",
  "Lead Source",
  "Next follow-up",
  "Assignee",
  "Lead Owner",
  "Created By",
];

/**
 * One inquiry while it loads: the real back link, the facts card with its
 * real labels, the timeline and the tasks panel.
 */
export function InquiryDetailSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <div className="space-y-3">
        <Link
          href={inquiriesPath(projectId)}
          className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Inquiries
        </Link>
        <div className="min-w-0 space-y-1">
          <h2 className="text-xl font-semibold">
            <span className="sr-only">Loading the inquiry</span>
            <SkeletonText size="xl" width="min(14rem, 70vw)" />
          </h2>
          <SkeletonText width="min(18rem, 80vw)" />
        </div>
      </div>
      <div className="grid w-full min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-6">
          <dl className="grid min-w-0 gap-4 rounded-lg border p-4 sm:grid-cols-3">
            {FACTS.map((label, index) => (
              <div key={label} className="min-w-0">
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd>
                  <SkeletonText width={WIDTHS[index % WIDTHS.length]} />
                </dd>
              </div>
            ))}
          </dl>
          <section className="min-w-0 space-y-3">
            <h3 className="text-sm font-semibold">Follow-ups and history</h3>
            <TimelineSkeleton />
          </section>
        </div>
        <aside className="bg-card h-fit min-w-0 rounded-lg border p-4">
          <InquiryTasksSkeleton />
        </aside>
      </div>
    </div>
  );
}

const INQUIRY_FIELDS: SalesSkeletonField[] = [
  { label: "Inquiry Date" },
  { label: "Name" },
  { label: "Mobile" },
  { label: "Email" },
  { label: "Occupation" },
  { label: "Interest Type" },
  { label: "Unit type" },
  { label: "Lead Source" },
  { label: "Funnel Stage" },
  { label: "Assignee" },
  { label: "Lead Owner" },
  { label: "Next follow-up", className: "sm:col-span-2 lg:col-span-1" },
  { label: "Address", rows: 2, className: "sm:col-span-2 lg:col-span-3" },
  { label: "Remarks", rows: 3, className: "sm:col-span-2 lg:col-span-3" },
];

/** The inquiry form while its options load: every field's real label. */
export function InquiryFormSkeleton() {
  return (
    <SkeletonGroup
      label="Loading the inquiry form"
      className="w-full max-w-4xl space-y-6"
    >
      <FieldGridSkeleton
        fields={INQUIRY_FIELDS}
        className="grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      />
      <FormActionsSkeleton />
    </SkeletonGroup>
  );
}

/** Edit an inquiry while it loads: its name is data, so the header is bars. */
export function InquiryEditSkeleton({
  projectId,
  inquiryId,
}: {
  projectId: string;
  inquiryId: string;
}) {
  return (
    <div className="flex w-full flex-col gap-4 p-6">
      <div className="w-full max-w-4xl">
        <RecordHeaderSkeleton
          back={{ href: inquiriesPath(projectId, inquiryId) }}
        />
      </div>
      <InquiryFormSkeleton />
    </div>
  );
}
