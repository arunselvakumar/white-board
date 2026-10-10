"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  Building2,
  ClipboardCheck,
  CreditCard,
  FileText,
  FlaskConical,
  DraftingCompass,
  HardHat,
  Handshake,
  Layers,
  MapPin,
  Package,
  SearchCheck,
  SlidersHorizontal,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { Button } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";

import { orderValueLabel } from "@/components/projects/project-contract";
import {
  ProjectStatusBadge,
  formatCalendarDate,
} from "@/components/projects/project-status";
import {
  browserToday,
  durationProblem,
  presetDuration,
  type Duration,
} from "@/lib/dashboard-duration";
import { projectTypeLabel } from "@/src/projects/domain/project-type";
import { QueryHttpError } from "@/src/queries/http";
import {
  dashboardAttendanceQuery,
  dashboardLayoutQuery,
  projectSummaryQuery,
  type DashboardSection,
} from "@/src/queries/project-dashboard";

import { AttendanceTrend } from "./attendance-trend";
import { DurationFilter } from "./duration-filter";
import { ManageDashboardDialog } from "./manage-dashboard-dialog";

/** The four KPI tiles; each names the milestone that will fill it. */
const KPIS: readonly {
  label: string;
  milestone: string;
  icon: LucideIcon;
}[] = [
  { label: "Material Approvals", milestone: "M5", icon: Package },
  { label: "Payment Approvals", milestone: "M7", icon: CreditCard },
  { label: "Pending Issues & Snags", milestone: "M8", icon: TriangleAlert },
  { label: "Pending Inspections", milestone: "M8", icon: SearchCheck },
];

/** What each stub section will show once its milestone lands. */
const STUB_TEXT: Record<string, string> = {
  task: "Project progress, value earned by tasks and tasks by status.",
  payments: "Payments in and out, due payments and the split by module.",
  daily_work: "Labour availability and contractor-wise labour from worksheets.",
  equipment_usage: "Top equipment by work hours, owned and rented.",
  materials:
    "Material summary, month-wise purchase order value and the stock register.",
  issue_snag: "Issues and snags by status.",
  inspection_request: "Inspection requests by status and the success rate.",
  booking: "Units booked and available, and the booking report.",
  inquiry: "The inquiry funnel.",
};

const MILESTONE_NAMES: Record<string, string> = {
  M5: "Procurement & inventory (M5)",
  M6: "Daily site work (M6)",
  M7: "Finance (M7)",
  M8: "Tasks, issues and inspections (M8)",
  M10: "Sales (M10)",
};

function milestoneName(milestone: string): string {
  return MILESTONE_NAMES[milestone] ?? milestone;
}

function Section({
  id,
  title,
  children,
  aside,
}: {
  id: string;
  title: string;
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="bg-card min-w-0 space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id={id} className="font-semibold">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Fact({
  label,
  icon: Icon,
  children,
}: {
  label: string;
  icon?: LucideIcon;
  children: ReactNode;
}) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-lg px-3 py-2.5">
      <dt className="text-muted-foreground flex items-center gap-1.5 text-xs">
        {Icon == null ? null : <Icon aria-hidden="true" className="size-3.5" />}
        {label}
      </dt>
      <dd className="mt-0.5 text-sm font-medium break-words tabular-nums">
        {children}
      </dd>
    </div>
  );
}

function SectionSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-busy="true">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-14 rounded-lg" />
      ))}
    </div>
  );
}

function denied(error: unknown): boolean {
  return error instanceof QueryHttpError && error.status === 403;
}

/** Dates, status, type, budget (Financial) and what the Project holds. */
function SummarySection({ projectId }: { projectId: string }) {
  const { data, isPending, error } = useQuery(projectSummaryQuery(projectId));
  const none = <span className="text-muted-foreground font-normal">—</span>;
  return (
    <Section id="dashboard-summary" title="Project summary">
      {isPending ? (
        <SectionSkeleton />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          The Project summary could not be loaded.
        </p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <Fact label="Status">
            <ProjectStatusBadge status={data.project.status} />
          </Fact>
          <Fact label="Project Type">
            {data.project.projectType == null
              ? "Not set"
              : projectTypeLabel(data.project.projectType)}
          </Fact>
          <Fact label="Start date">
            {data.project.startDate == null
              ? none
              : formatCalendarDate(data.project.startDate)}
          </Fact>
          <Fact label="Expected completion">
            {data.project.endDate == null
              ? none
              : formatCalendarDate(data.project.endDate)}
          </Fact>
          {data.financial ? (
            <Fact label="Budget">
              {data.project.budgetValue == null
                ? none
                : orderValueLabel(data.project.budgetValue)}
            </Fact>
          ) : null}
          {data.project.structure === "wings" || data.counts.wings > 0 ? (
            <>
              <Fact label="Wings" icon={Building2}>
                {data.counts.wings}
              </Fact>
              <Fact label="Floors" icon={Layers}>
                {data.counts.floors}
              </Fact>
              <Fact label="Units" icon={Building2}>
                {data.counts.units}
              </Fact>
            </>
          ) : null}
          {data.project.structure === "locations" ||
          data.counts.locations > 0 ? (
            <Fact label="Locations" icon={MapPin}>
              {data.counts.locations}
            </Fact>
          ) : null}
          <Fact label="Drawings" icon={DraftingCompass}>
            {data.counts.drawings}
          </Fact>
          <Fact label="Testing reports" icon={FlaskConical}>
            {data.counts.testingReports}
          </Fact>
          <Fact label="Documents" icon={FileText}>
            {data.counts.documents}
          </Fact>
        </dl>
      )}
    </Section>
  );
}

/** Labour on the duration's last day and the day-wise trend (M2 data). */
function AttendanceSection({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, isPending, error } = useQuery(
    dashboardAttendanceQuery(projectId, duration),
  );
  const today = duration.to === browserToday();
  return (
    <Section id="dashboard-attendance" title="Attendance">
      {isPending ? (
        <SectionSkeleton />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Attendance needs the Attendance permission on this Project."
            : "Attendance could not be loaded."}
        </p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Fact
              label={
                today
                  ? "Labours present today"
                  : `Present on ${formatCalendarDate(data.date)}`
              }
              icon={HardHat}
            >
              {`${String(data.labourers.present + data.labourers.halfDay)} of ${String(data.labourers.onProject)}`}
            </Fact>
            <Fact label="Absent" icon={UserX}>
              {data.labourers.absent}
            </Fact>
            <Fact label="Not marked" icon={ClipboardCheck}>
              {data.labourers.unmarked}
            </Fact>
            <Fact label="Vendor heads" icon={Handshake}>
              {data.vendors.headcountToday}
            </Fact>
          </dl>
          <AttendanceTrend series={data.presentSeries} />
        </div>
      )}
    </Section>
  );
}

/** A section whose data comes with a later milestone. */
function StubSection({ section }: { section: DashboardSection }) {
  return (
    <Section
      id={`dashboard-${section.key}`}
      title={section.label}
      aside={
        <span className="text-muted-foreground text-xs">
          Arrives with {milestoneName(section.milestone ?? "")}
        </span>
      }
    >
      <p className="text-muted-foreground rounded-lg border border-dashed p-4 text-sm">
        {STUB_TEXT[section.key] ?? section.label}
      </p>
    </Section>
  );
}

function KpiTiles() {
  return (
    <ul
      aria-label="Key figures"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {KPIS.map((kpi) => (
        <li
          key={kpi.label}
          className="bg-card flex min-w-0 flex-col gap-2 rounded-xl border border-dashed p-4"
        >
          <span className="text-muted-foreground flex items-center gap-2 text-sm">
            <kpi.icon aria-hidden="true" className="size-4 shrink-0" />
            <span className="min-w-0">{kpi.label}</span>
          </span>
          <span className="text-muted-foreground text-2xl font-semibold">
            —
          </span>
          <span className="text-muted-foreground text-xs">
            Arrives with {kpi.milestone}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The Project Dashboard (CM-412, ADR CM-0013 §12): the duration filter
 * (last 12 months by default), the four KPI tiles, and the member's
 * sections in their order. Project summary and Attendance have data;
 * the rest name the milestone that fills them. Manage Dashboard shows,
 * hides and reorders sections for the member on every Project.
 */
export function ProjectDashboard({ projectId }: { projectId: string }) {
  const { data: layout } = useSuspenseQuery(dashboardLayoutQuery);
  const [duration, setDuration] = useState<Duration>(() =>
    presetDuration("last_12_months", browserToday()),
  );
  const [managing, setManaging] = useState(false);
  const problem = durationProblem(duration);
  const shown = layout.sections.filter((section) => section.visible);

  return (
    <div className="w-full min-w-0 p-6">
      <div className="w-full max-w-6xl min-w-0 space-y-6">
        <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="text-lg font-semibold">Dashboard</h2>
            <p className="text-muted-foreground text-sm">
              {formatCalendarDate(duration.from)} –{" "}
              {formatCalendarDate(duration.to)}
            </p>
          </div>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-end">
            <DurationFilter value={duration} onChange={setDuration} />
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setManaging(true);
              }}
            >
              <SlidersHorizontal aria-hidden="true" />
              Manage dashboard
            </Button>
          </div>
        </div>
        {problem == null ? null : (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
        <KpiTiles />
        {shown.length === 0 ? (
          <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
            Every section is hidden. Use Manage dashboard to show some.
          </p>
        ) : (
          shown.map((section) => {
            if (section.key === "summary")
              return <SummarySection key={section.key} projectId={projectId} />;
            if (section.key === "attendance")
              return problem == null ? (
                <AttendanceSection
                  key={section.key}
                  projectId={projectId}
                  duration={duration}
                />
              ) : null;
            return <StubSection key={section.key} section={section} />;
          })
        )}
      </div>
      {managing ? (
        <ManageDashboardDialog
          sections={layout.sections}
          onClose={() => {
            setManaging(false);
          }}
        />
      ) : null}
    </div>
  );
}
