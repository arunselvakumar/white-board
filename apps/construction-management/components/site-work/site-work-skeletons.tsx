import { ArrowLeft, CircleCheck, CircleDot, LayoutGrid } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import type { FilterTab } from "@repo/ui/components/filter-tabs";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  FormSkeleton,
  SkeletonGroup,
  SkeletonText,
  TableSkeleton,
  type SkeletonColumn,
} from "@repo/ui/components/skeleton-kit";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { cn } from "@repo/ui/lib/utils";

import { PageHeaderSkeleton } from "@/components/app-shell/page-header-skeleton";
import {
  DocumentDetailSkeleton,
  ResponsiveListSkeleton,
} from "@/components/procurement/procurement-skeletons";

/*
 * Site work while it loads (ADR-0047): worksheets, equipment, hindrances,
 * progress reports and the site diary. List pages keep their heading and
 * buttons real; these draw the filter bar that comes with the rows.
 */

const WIDTHS = ["62%", "48%", "71%", "55%", "40%"];

const ACTIONS: SkeletonColumn = {
  header: <span className="sr-only">Actions</span>,
  kind: "actions",
  className: "w-12",
};

const SELECT: SkeletonColumn = {
  header: <span className="sr-only">Select</span>,
  kind: "checkbox",
  className: "w-10",
};

/** Daily Worksheets: the filter bar, the count, the rows. */
export function WorksheetRowsSkeleton({
  approval,
  bulk,
}: {
  approval: boolean;
  bulk: boolean;
}) {
  return (
    <ResponsiveListSkeleton
      label="Loading worksheets"
      lines={2}
      filters={[
        "Date",
        "Filled By",
        "Contractor",
        "Department",
        ...(approval ? ["Approval"] : []),
      ]}
      columns={[
        ...(bulk ? [SELECT] : []),
        { header: "Number" },
        { header: "Date", kind: "muted" },
        { header: "Contractor", kind: "muted" },
        { header: "Shift", kind: "muted" },
        { header: "Labour", kind: "muted" },
        { header: "Materials", kind: "muted" },
        ...(approval ? [{ header: "Status", kind: "badge" } as const] : []),
        { header: "Filled By", kind: "muted" },
        ACTIONS,
      ]}
    />
  );
}

/** Equipment Usage sheets: the filter bar, the count, the rows. */
export function EquipmentSheetRowsSkeleton({
  approval,
  bulk,
}: {
  approval: boolean;
  bulk: boolean;
}) {
  return (
    <ResponsiveListSkeleton
      label="Loading usage sheets"
      lines={2}
      filters={[
        "Date",
        "Equipment",
        "Ownership",
        "Filled By",
        ...(approval ? ["Approval"] : []),
      ]}
      columns={[
        ...(bulk ? [SELECT] : []),
        { header: "Number" },
        { header: "Date", kind: "muted" },
        { header: "Equipment", kind: "muted" },
        { header: "Usage", kind: "muted" },
        { header: "Idle", kind: "muted" },
        { header: "Breakdown", kind: "muted" },
        ...(approval ? [{ header: "Status", kind: "badge" } as const] : []),
        { header: "Filled By", kind: "muted" },
        ACTIONS,
      ]}
    />
  );
}

/** The attendance panel of the worksheet form while the day's count loads. */
export function AttendancePanelSkeleton({ title }: { title: string }) {
  return (
    <section className="bg-muted/40 space-y-2 rounded-lg border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-medium">{title}</h4>
        <Skeleton aria-hidden="true" className="h-7 w-28 rounded-lg" />
      </div>
      <SkeletonGroup label="Loading attendance" className="block">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted-foreground text-xs">
              <th scope="col" className="text-left font-normal">
                <span className="sr-only">Heads</span>
              </th>
              <th scope="col" className="text-right font-normal">
                Skilled
              </th>
              <th scope="col" className="text-right font-normal">
                Unskilled
              </th>
            </tr>
          </thead>
          <tbody>
            {["Attendance", "On other worksheets", "Remaining"].map((row) => (
              <tr key={row}>
                <th scope="row" className="py-0.5 text-left font-normal">
                  {row}
                </th>
                <td>
                  <SkeletonText width="1.5rem" className="ml-auto" />
                </td>
                <td>
                  <SkeletonText width="1.5rem" className="ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </SkeletonGroup>
    </section>
  );
}

/** A settings dialog's list of fields with their switches. */
export function SettingsListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <SkeletonGroup label="Loading settings" className="block">
      <ul className="divide-y rounded-lg border">
        {Array.from({ length: rows }, (_, row) => (
          <li
            key={row}
            className="flex items-center justify-between gap-4 px-3 py-2.5"
          >
            <SkeletonText width={WIDTHS[row % WIDTHS.length]} />
            <Skeleton className="h-[1.15rem] w-8 shrink-0 rounded-full" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** Material checkboxes in a picker dialog while they load. */
export function MaterialChecklistSkeleton() {
  return (
    <SkeletonGroup label="Loading materials" className="block">
      <ul className="divide-y rounded-lg border">
        {WIDTHS.slice(0, 3).map((width) => (
          <li key={width} className="flex items-start gap-3 px-3 py-2">
            <Skeleton className="size-4 shrink-0 rounded-[4px]" />
            <div className="min-w-0 flex-1">
              <SkeletonText width={width} />
              <SkeletonText size="xs" width="35%" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

const projectPath = (projectId: string, rest: string) =>
  `/app/projects/${encodeURIComponent(projectId)}/${rest}`;

/** A Daily Worksheet's page: facts, then the materials used. */
export function WorksheetDetailSkeleton({ projectId }: { projectId: string }) {
  return (
    <DocumentDetailSkeleton
      back={{
        label: "Daily Worksheet",
        href: projectPath(projectId, "worksheets"),
      }}
      label="Loading worksheet"
      facts={[
        "Location",
        "Contractor",
        "Department",
        "Work Type",
        "Labour",
        "Approx Work Done",
        "Task",
        "Filled By",
        "Filled on",
      ]}
      sections={[
        {
          title: "Materials",
          columns: [
            { header: "Material" },
            { header: "Used Qty", kind: "number", className: "text-right" },
          ],
        },
      ]}
    />
  );
}

/** An Equipment Usage sheet's page: its facts. */
export function EquipmentSheetDetailSkeleton({
  projectId,
}: {
  projectId: string;
}) {
  return (
    <DocumentDetailSkeleton
      back={{
        label: "Usage sheets",
        href: projectPath(projectId, "equipment/usage-sheets"),
      }}
      label="Loading usage sheet"
      facts={[
        "Equipment",
        "Measured by",
        "Usage",
        "Idle",
        "Breakdown",
        "Operator",
        "Supervisor",
        "Contractor",
        "Department",
        "Work Item",
        "Location",
        "Approx Work Done",
      ]}
    />
  );
}

/** "Add Worksheet" and the like over a form's skeleton. */
export function TitledFormSkeleton({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

/** The Daily Worksheet form while its options load. */
export function WorksheetFormSkeleton() {
  return (
    <FormSkeleton
      className="w-full max-w-4xl"
      columns={2}
      label="Loading worksheet form"
      fields={[
        { label: "Location", control: "select", wide: true },
        { label: "Contractor", control: "select" },
        { label: "Department", control: "select" },
        { label: "Work Type", control: "select" },
        { label: "Work Shift", control: "select" },
        { label: "Skilled Labours" },
        { label: "Unskilled Labours" },
      ]}
    />
  );
}

/** The Equipment Usage form while its options load. */
export function EquipmentSheetFormSkeleton() {
  return (
    <FormSkeleton
      className="w-full max-w-4xl"
      columns={2}
      label="Loading usage sheet form"
      fields={[
        { label: "Equipment", control: "select", wide: true },
        { label: "Opening reading" },
        { label: "Closing reading" },
        { label: "Idle hours" },
        { label: "Breakdown hours" },
      ]}
    />
  );
}

/** The equipment register's rows: name, summary, place, state. */
export function EquipmentRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading equipment" className="block space-y-3">
      <SkeletonText width="6rem" />
      <ul className="divide-y rounded-lg border">
        {WIDTHS.map((width) => (
          <li key={width} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1 space-y-1">
              <SkeletonText size="base" width={width} className="max-w-64" />
              <SkeletonText width="55%" />
              <SkeletonText width="35%" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="size-4 shrink-0 rounded-sm" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

const EQUIPMENT_FACTS = [
  "Where it is",
  "State",
  "Purchase Year",
  "Utilisation",
  "Fuel",
  "Target",
  "Min Utilisation",
  "Expected Fuel Efficiency",
  "Contact",
];

/** One machine's page while it loads: photo, name, facts. */
export function EquipmentDetailSkeleton({
  back,
}: {
  back: { label: string; href: string };
}) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeaderSkeleton
          back={back}
          leading={
            <Skeleton
              aria-hidden="true"
              className="size-14 shrink-0 rounded-lg"
            />
          }
        />
        <SkeletonGroup label="Loading equipment" className="block space-y-6">
          <dl className="bg-card grid gap-4 rounded-xl border p-4 sm:grid-cols-3 sm:p-5">
            {EQUIPMENT_FACTS.map((fact, index) => (
              <div key={fact} className="min-w-0">
                <dt className="text-muted-foreground text-xs">{fact}</dt>
                <dd>
                  <SkeletonText width={WIDTHS[index % WIDTHS.length]} />
                </dd>
              </div>
            ))}
          </dl>
          <section className="space-y-3">
            <h2 className="text-base font-semibold">Movement history</h2>
            <TableSkeleton
              rows={3}
              columns={[
                { header: "Transfer Date" },
                { header: "Location Before", kind: "muted" },
                { header: "Transfer To Project", kind: "muted" },
                { header: "Latest Location", kind: "muted" },
                { header: "Remarks", kind: "muted" },
                { header: "Entry By", kind: "muted" },
              ]}
            />
          </section>
        </SkeletonGroup>
      </div>
    </div>
  );
}

/** The equipment form while its options (Projects, types) load. */
export function EquipmentFormSkeleton() {
  return (
    <FormSkeleton
      columns={2}
      label="Loading equipment form"
      fields={[
        { label: "Equipment type", control: "select", wide: true },
        { label: "Equipment Name" },
        { label: "Equipment Number" },
        { label: "Purchase Year" },
        { label: "Contact Person" },
        { label: "Contact Number" },
        { label: "Company Name" },
      ]}
    />
  );
}

/** Edit equipment while the machine loads: the header, then the form. */
export function EditEquipmentSkeleton() {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeaderSkeleton
          back={{ label: "Equipment", href: "/app/masters/equipments" }}
          meta={false}
        />
        <EquipmentFormSkeleton />
      </div>
    </div>
  );
}

/** The Hindrances list's Status tabs. */
export const HINDRANCE_STATUS_TABS: FilterTab<"all" | "open" | "closed">[] = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "open", label: "Open", icon: CircleDot },
  { value: "closed", label: "Closed", icon: CircleCheck },
];

/** Hindrances: the count, then cards two to a row from `lg`. */
export function HindranceRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading hindrances" className="block space-y-3">
      <SkeletonText width="6rem" />
      <ul className="grid gap-2 lg:grid-cols-2">
        {WIDTHS.map((width) => (
          <li key={width} className="bg-card rounded-lg border p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-0.5">
                <SkeletonText size="base" width="6rem" />
                <SkeletonText width={width} />
              </div>
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
            <SkeletonText className="mt-1" width="50%" />
            <SkeletonText size="xs" className="mt-0.5" width="40%" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** The Hindrances page while the viewer's rights and options load. */
export function HindrancesPageSkeleton() {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <h2 className="font-semibold">Hindrances</h2>
      <div
        inert
        className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end"
      >
        {/* The icons render here, not in `FilterTabs`, so a server page can show this. */}
        <Tabs defaultValue="all" className="min-w-0">
          <TabsList aria-label="Status">
            {HINDRANCE_STATUS_TABS.map(({ value, label, icon: Icon }) => (
              <TabsTrigger key={value} value={value}>
                {Icon == null ? null : <Icon aria-hidden />}
                {label}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        {["Cause", "Responsible party", "From", "To"].map((label) => (
          <div key={label} className="space-y-1">
            <p className="text-xs leading-none font-medium">{label}</p>
            <Skeleton className="h-8 w-full rounded-lg sm:w-36" />
          </div>
        ))}
        <Skeleton className="h-8 w-full rounded-lg sm:w-52" />
      </div>
      <HindranceRowsSkeleton />
    </div>
  );
}

/** A back link and the `h2` of a site record, with the title a bar when it is data. */
export function SiteRecordHeaderSkeleton({
  back,
  title,
  size = "form",
}: {
  back: { label: string; href: string };
  title?: string;
  size?: "form" | "detail";
}) {
  return (
    <div className="space-y-3">
      <Link
        href={back.href}
        className="text-muted-foreground inline-flex items-center gap-1 text-sm hover:underline"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        {back.label}
      </Link>
      {title == null ? (
        <div aria-hidden="true" className="min-w-0 space-y-1">
          <SkeletonText size={size === "form" ? "lg" : "xl"} width="9rem" />
          {size === "detail" ? <SkeletonText width="14rem" /> : null}
        </div>
      ) : (
        <h2
          className={cn(
            "font-semibold break-words",
            size === "form" ? "text-lg" : "text-xl",
          )}
        >
          {title}
        </h2>
      )}
    </div>
  );
}

const hindrancesHref = (projectId: string) =>
  projectPath(projectId, "hindrances");

/** A hindrance's page: number and cause, then its facts. */
export function HindranceDetailSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <SiteRecordHeaderSkeleton
        size="detail"
        back={{ label: "Hindrances", href: hindrancesHref(projectId) }}
      />
      <SkeletonGroup
        label="Loading hindrance"
        className="block w-full max-w-4xl space-y-6"
      >
        <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
          {[
            "Affected activity",
            "Time lost",
            "Start date",
            "End date",
            "Responsible party",
            "Location",
            "Recorded by",
          ].map((fact, index) => (
            <div
              key={fact}
              className={cn("min-w-0", index === 0 && "sm:col-span-2")}
            >
              <dt className="text-muted-foreground text-xs">{fact}</dt>
              <dd className="mt-0.5">
                <SkeletonText width={WIDTHS[index % WIDTHS.length]} />
              </dd>
            </div>
          ))}
        </dl>
      </SkeletonGroup>
    </div>
  );
}

/** Record or Edit hindrance while its options (and the record) load. */
export function HindranceFormSkeleton({
  projectId,
  title,
}: {
  projectId: string;
  /** "Record hindrance"; left out on Edit, where it is the number. */
  title?: string;
}) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <SiteRecordHeaderSkeleton
        back={{ label: "Hindrances", href: hindrancesHref(projectId) }}
        title={title}
      />
      <HindranceFormFieldsSkeleton />
    </div>
  );
}

/** The hindrance form's fields while its options load. */
export function HindranceFormFieldsSkeleton() {
  return (
    <FormSkeleton
      className="w-full max-w-4xl"
      columns={2}
      label="Loading hindrance form"
      fields={[
        { label: "Start date" },
        { label: "End date" },
        { label: "Hours lost" },
        { label: "Cause", control: "select" },
        { label: "Affected activity", wide: true },
        { label: "Responsible party", control: "select" },
        { label: "Description", control: "textarea", wide: true },
      ]}
    />
  );
}

/** Progress Reports: title and status, who and when, the downloads. */
export function ProgressReportRowsSkeleton() {
  return (
    <SkeletonGroup label="Loading reports" className="block">
      <ul className="divide-y rounded-xl border">
        {WIDTHS.slice(0, 3).map((width) => (
          <li
            key={width}
            className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <SkeletonText size="base" width="12rem" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <SkeletonText width={width} />
            </div>
            <Skeleton className="h-7 w-24 shrink-0 rounded-lg" />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** The Progress Reports page while the viewer's rights load. */
export function ProgressReportsPageSkeleton() {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="space-y-1">
        <h2 className="font-semibold">Progress Reports</h2>
        <p className="text-muted-foreground text-sm">
          Daily Progress Reports (the site diary of a day) and Task Progress
          Reports (each task&apos;s progress over a period), as PDFs.
        </p>
      </div>
      <section className="space-y-3">
        <h3 className="text-sm font-medium">View Reports</h3>
        <ProgressReportRowsSkeleton />
      </section>
    </div>
  );
}

/** The Create Progress Report form while its options load. */
export function ProgressReportFormSkeleton() {
  return (
    <FormSkeleton
      columns={2}
      actions={2}
      label="Loading report options"
      fields={[
        { label: "Report type", control: "select", wide: true },
        { label: "Date" },
        { label: "Report filled by", control: "select" },
      ]}
    />
  );
}

/** One day's Site Diary: weather, facts, visitors and instructions. */
export function DiaryDaySkeleton() {
  return (
    <SkeletonGroup label="Loading diary" className="block min-w-0 space-y-5">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-7 w-32 rounded-full" />
        <Skeleton className="h-7 w-36 rounded-full" />
      </div>
      <dl className="grid gap-4 rounded-lg border p-4 sm:grid-cols-3">
        {["Rainfall", "Site condition", "Written by"].map((fact, index) => (
          <div
            key={fact}
            className={cn("min-w-0", index === 1 && "sm:col-span-2")}
          >
            <dt className="text-muted-foreground text-xs">{fact}</dt>
            <dd className="mt-0.5">
              <SkeletonText width={WIDTHS[index]} />
            </dd>
          </div>
        ))}
      </dl>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Visitors</h3>
        <TableSkeleton
          rows={2}
          columns={[
            { header: "Name" },
            { header: "Organisation", kind: "muted" },
            { header: "Purpose", kind: "muted" },
            { header: "In", kind: "muted" },
            { header: "Out", kind: "muted" },
          ]}
        />
      </div>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Instructions</h3>
        <TableSkeleton
          rows={2}
          columns={[
            { header: "Given by" },
            { header: "Given to", kind: "muted" },
            { header: "Instruction", kind: "muted" },
            { header: "Action taken", kind: "muted" },
          ]}
        />
      </div>
    </SkeletonGroup>
  );
}

/** The month's diary days in the side list. */
export function DiaryMonthSkeleton() {
  return (
    <SkeletonGroup label="Loading diaries this month" className="block">
      <ul className="space-y-1">
        {["4rem", "6rem", "5rem", "4.5rem"].map((width) => (
          <li
            key={width}
            className="flex items-center justify-between gap-2 px-2 py-1.5"
          >
            <SkeletonText width="2.5rem" />
            <SkeletonText size="xs" width={width} />
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

/** The Site Diary page while the viewer's rights load. */
export function SiteDiaryPageSkeleton() {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="font-semibold">Site Diary</h2>
          <div aria-hidden="true">
            <SkeletonText width="10rem" />
          </div>
        </div>
        <div aria-hidden="true" className="flex items-center gap-1">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="size-8 rounded-lg" />
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_16rem]">
        <DiaryDaySkeleton />
        <div className="space-y-2">
          <div
            aria-hidden="true"
            className="flex items-center justify-between gap-2"
          >
            <Skeleton className="size-7 rounded-lg" />
            <SkeletonText width="6rem" />
            <Skeleton className="size-7 rounded-lg" />
          </div>
          <DiaryMonthSkeleton />
        </div>
      </div>
    </div>
  );
}

/** Edit Site Diary while the diary loads. */
export function SiteDiaryFormSkeleton({ projectId }: { projectId: string }) {
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <SiteRecordHeaderSkeleton
        back={{
          label: "Site Diary",
          href: projectPath(projectId, "site-diary"),
        }}
        title="Edit Site Diary"
      />
      <FormSkeleton
        className="w-full max-w-4xl"
        columns={2}
        label="Loading Site Diary"
        fields={[
          { label: "Date" },
          { label: "Weather (morning)", control: "select" },
          { label: "Weather (afternoon)", control: "select" },
          { label: "Rainfall (mm)" },
          { label: "Site condition", control: "textarea", wide: true },
        ]}
      />
    </div>
  );
}
