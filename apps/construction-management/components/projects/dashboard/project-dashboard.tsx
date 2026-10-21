"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import {
  Building2,
  ChevronsDownUp,
  ChevronsUpDown,
  ClipboardCheck,
  FileText,
  FlaskConical,
  DraftingCompass,
  HardHat,
  Handshake,
  Layers,
  MapPin,
  Package,
  SlidersHorizontal,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { MetricCard } from "@repo/ui/components/metric-card";

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
import { isDashboardSectionKey } from "@/src/projects/domain/dashboard-sections";
import { projectTypeLabel } from "@/src/projects/domain/project-type";
import {
  dashboardAttendanceQuery,
  dashboardLayoutQuery,
  projectSummaryQuery,
  type DashboardSection,
} from "@/src/queries/project-dashboard";
import { procurementDashboardQuery } from "@/src/queries/procurement-dashboard";

import { materialsPath } from "@/components/procurement/materials-hub/materials-tabs";

import { AttendanceTrend } from "./attendance-trend";
import { Fact, Rupees, Section, Unit, denied } from "./dashboard-parts";
import {
  DashboardSectionsSkeleton,
  MetricCaptionSkeleton,
  MetricFigureSkeleton,
  SectionSkeleton,
} from "./dashboard-skeletons";
import { DurationFilter } from "./duration-filter";
import { PaymentApprovalsTile, PaymentsSection } from "./finance-sections";
import { ManageDashboardDialog } from "./manage-dashboard-dialog";
import { PoValueChart } from "./po-value-chart";
import {
  SectionCollapseProvider,
  useSectionCollapse,
} from "./section-collapse";
// Sales (CM-1008)
import { BookingSection, InquirySection } from "./sales-sections";
import { DailyWorkSection, EquipmentUsageSection } from "./site-work-sections";
import {
  InspectionSection,
  IssueSection,
  PendingInspectionsTile,
  PendingIssuesTile,
  TaskSection,
} from "./tracking-sections";

/**
 * What each stub section will show once its milestone lands, and the
 * milestones' names. Empty since M10 filled the last stubs; a later
 * section waiting for its milestone adds its words here.
 */
const STUB_TEXT: Record<string, string> = {};

const MILESTONE_NAMES: Record<string, string> = {};

function milestoneName(milestone: string): string {
  return MILESTONE_NAMES[milestone] ?? milestone;
}

/** Dates, status, type, budget (Financial) and what the Project holds. */
function SummarySection({ projectId }: { projectId: string }) {
  const { data, isPending, error } = useQuery(projectSummaryQuery(projectId));
  const none = <span className="text-muted-foreground font-normal">—</span>;
  return (
    <Section id="dashboard-summary" title="Project summary">
      {isPending ? (
        <SectionSkeleton
          label="Loading the Project summary"
          facts={[
            { label: "Status" },
            { label: "Project Type" },
            { label: "Start date" },
            { label: "Expected completion" },
          ]}
        />
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
              {data.project.budgetValue == null ? (
                none
              ) : (
                <Rupees paise={data.project.budgetValue} />
              )}
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
        <SectionSkeleton
          label="Loading Attendance"
          chart
          facts={[
            {
              label: today
                ? "Labours present today"
                : `Present on ${formatCalendarDate(duration.to)}`,
              icon: HardHat,
            },
            { label: "Absent", icon: UserX },
            { label: "Not marked", icon: ClipboardCheck },
            { label: "Vendor heads", icon: Handshake },
          ]}
        />
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
              {data.labourers.present + data.labourers.halfDay}
              <Unit>/{data.labourers.onProject}</Unit>
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

/**
 * Pending Purchase Requests, Purchase Orders and Material Transfers the
 * viewer may approve on this Project (CM-510); "—" when they may approve
 * none of them.
 */
function MaterialApprovalsTile({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, error } = useQuery(
    procurementDashboardQuery(projectId, duration),
  );
  const approvals = data?.approvals;
  const any =
    approvals != null &&
    (approvals.purchaseRequests != null ||
      approvals.purchaseOrders != null ||
      approvals.transfers != null);
  const parts =
    approvals == null
      ? []
      : [
          approvals.purchaseRequests == null
            ? null
            : `${String(approvals.purchaseRequests)} PR`,
          approvals.purchaseOrders == null
            ? null
            : `${String(approvals.purchaseOrders)} PO`,
          approvals.transfers == null
            ? null
            : `${String(approvals.transfers)} transfer`,
        ].filter((part) => part != null);
  const pendingPath =
    approvals == null
      ? null
      : (approvals.purchaseRequests ?? 0) > 0
        ? materialsPath(projectId, "purchase-requests")
        : (approvals.purchaseOrders ?? 0) > 0
          ? materialsPath(projectId, "purchase-orders")
          : (approvals.transfers ?? 0) > 0
            ? materialsPath(projectId, "transfers")
            : null;
  return (
    <li className="flex min-w-0">
      <MetricCard
        className="w-full"
        label="Material Approvals"
        icon={Package}
        value={
          any ? (
            approvals.total
          ) : approvals == null && error == null ? (
            <MetricFigureSkeleton />
          ) : (
            <span className="text-muted-foreground">—</span>
          )
        }
        caption={
          error != null ? (
            "Could not be loaded"
          ) : approvals == null ? (
            <MetricCaptionSkeleton />
          ) : any ? (
            `Pending: ${parts.join(" · ")}`
          ) : (
            "Nothing here for you to approve"
          )
        }
        render={pendingPath == null ? undefined : <Link href={pendingPath} />}
      />
    </li>
  );
}

function KpiTiles({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  return (
    <ul
      aria-label="Key figures"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      <MaterialApprovalsTile projectId={projectId} duration={duration} />
      <PaymentApprovalsTile projectId={projectId} duration={duration} />
      <PendingIssuesTile projectId={projectId} duration={duration} />
      <PendingInspectionsTile projectId={projectId} duration={duration} />
    </ul>
  );
}

/**
 * Material Summary, purchase orders and their month-wise value (CM-510).
 * Each part shows only with its permission on the Project.
 */
function MaterialsSection({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, isPending, error } = useQuery(
    procurementDashboardQuery(projectId, duration),
  );
  return (
    <Section
      id="dashboard-materials"
      title="Materials"
      aside={
        <Link
          href={`${materialsPath(projectId, "inventory")}/register`}
          className="text-primary text-sm font-medium underline-offset-4 hover:underline"
        >
          Stock Register
        </Link>
      }
    >
      {isPending ? (
        <SectionSkeleton
          label="Loading Materials"
          className="grid grid-cols-2 gap-2 lg:grid-cols-3"
          facts={3}
          chart
        />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          Materials could not be loaded.
        </p>
      ) : data.materials == null && data.purchaseOrders == null ? (
        <p className="text-muted-foreground text-sm">
          Materials need the Current Inventory or Purchase Order permission on
          this Project.
        </p>
      ) : (
        <div className="space-y-5">
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-3">
            {data.materials == null ? null : (
              <>
                <Fact label="Materials" icon={Package}>
                  {data.materials.total}
                </Fact>
                <Fact label="In stock">{data.materials.inStock}</Fact>
                <Fact label="Low stock">{data.materials.lowStock}</Fact>
                <Fact label="Out of stock">{data.materials.outOfStock}</Fact>
              </>
            )}
            {data.purchaseOrders == null ? null : (
              <>
                <Fact label="Purchase orders" icon={FileText}>
                  {data.purchaseOrders.count}
                </Fact>
                <Fact label="Purchase order value">
                  <Rupees paise={data.purchaseOrders.value} />
                </Fact>
              </>
            )}
          </dl>
          {data.purchaseOrders == null ? null : (
            <PoValueChart months={data.purchaseOrders.months} />
          )}
        </div>
      )}
    </Section>
  );
}

/**
 * Sections that read the duration: an invalid one leaves them out. Project
 * summary and Booking (a snapshot as on today) always show.
 */
const DURATION_SECTIONS: ReadonlySet<string> = new Set([
  "attendance",
  "task",
  "payments",
  "daily_work",
  "equipment_usage",
  "materials",
  "issue_snag",
  "inspection_request",
  "inquiry",
]);

/** The sections the member sees on this Project, in their order. */
function shownSections(layout: { sections: DashboardSection[] }) {
  // A module hidden on the Project takes its section with it (CM-902).
  return layout.sections.filter(
    (section) => section.visible && !section.hiddenOnProject,
  );
}

/**
 * A section the member collapsed: its header only, without the section's
 * own component, so nothing is fetched until it is opened again.
 */
function CollapsedSection({ section }: { section: DashboardSection }) {
  return <Section id={`dashboard-${section.key}`} title={section.label} />;
}

/** The member's sections in their order; suspends on the layout read. */
function DashboardSections({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data: layout } = useSuspenseQuery(dashboardLayoutQuery(projectId));
  const collapse = useSectionCollapse();
  const problem = durationProblem(duration);
  const shown = shownSections(layout);
  if (shown.length === 0)
    return (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
        Every section is hidden. Use Manage dashboard to show some.
      </p>
    );
  return (
    <>
      {shown.map((section) => {
        if (problem != null && DURATION_SECTIONS.has(section.key)) return null;
        if (
          isDashboardSectionKey(section.key) &&
          collapse?.isCollapsed(section.key) === true
        )
          return <CollapsedSection key={section.key} section={section} />;
        if (section.key === "summary")
          return <SummarySection key={section.key} projectId={projectId} />;
        if (section.key === "attendance")
          return (
            <AttendanceSection
              key={section.key}
              projectId={projectId}
              duration={duration}
            />
          );
        if (section.key === "daily_work")
          return (
            <DailyWorkSection
              key={section.key}
              projectId={projectId}
              duration={duration}
            />
          );
        if (section.key === "equipment_usage")
          return (
            <EquipmentUsageSection
              key={section.key}
              projectId={projectId}
              duration={duration}
            />
          );
        if (section.key === "payments")
          return (
            <PaymentsSection
              key={section.key}
              projectId={projectId}
              duration={duration}
            />
          );
        if (section.key === "task")
          return (
            <TaskSection
              key={section.key}
              projectId={projectId}
              duration={duration}
            />
          );
        if (section.key === "issue_snag")
          return (
            <IssueSection
              key={section.key}
              projectId={projectId}
              duration={duration}
            />
          );
        if (section.key === "inspection_request")
          return (
            <InspectionSection
              key={section.key}
              projectId={projectId}
              duration={duration}
            />
          );
        if (section.key === "materials")
          return (
            <MaterialsSection
              key={section.key}
              projectId={projectId}
              duration={duration}
            />
          );
        // Sales (CM-1008).
        if (section.key === "inquiry")
          return (
            <InquirySection
              key={section.key}
              projectId={projectId}
              duration={duration}
            />
          );
        if (section.key === "booking")
          return <BookingSection key={section.key} projectId={projectId} />;
        return <StubSection key={section.key} section={section} />;
      })}
    </>
  );
}

/**
 * Collapse all, or Expand all once every shown section is collapsed. Hidden
 * until the layout has loaded.
 */
function CollapseAllButton({ projectId }: { projectId: string }) {
  const { data: layout } = useQuery(dashboardLayoutQuery(projectId));
  const collapse = useSectionCollapse();
  if (layout == null || collapse == null) return null;
  const keys = shownSections(layout)
    .map((section) => section.key)
    .filter(isDashboardSectionKey);
  if (keys.length === 0) return null;
  const allCollapsed = keys.every((key) => collapse.isCollapsed(key));
  return (
    <Button
      type="button"
      variant="outline"
      onClick={() => {
        collapse.setCollapsed(keys, !allCollapsed);
      }}
    >
      {allCollapsed ? (
        <ChevronsUpDown aria-hidden="true" />
      ) : (
        <ChevronsDownUp aria-hidden="true" />
      )}
      {allCollapsed ? "Expand all" : "Collapse all"}
    </Button>
  );
}

/** Manage Dashboard, on the layout the sections already read. */
function ManageDashboard({
  projectId,
  onClose,
}: {
  projectId: string;
  onClose: () => void;
}) {
  const { data: layout } = useSuspenseQuery(dashboardLayoutQuery(projectId));
  return <ManageDashboardDialog sections={layout.sections} onClose={onClose} />;
}

/**
 * The Project Dashboard (CM-412, ADR CM-0013 §12): the duration filter
 * (last 12 months by default), the four KPI tiles, and the member's
 * sections in their order. Project summary, Attendance, Task, Payments,
 * Daily Work, Equipment Usage, Materials, Issue & Snag and Inspection
 * Request have data (CM-805); Booking and Inquiry name the milestone that
 * fills them. Manage Dashboard shows,
 * hides and reorders sections for the member on every Project; sections
 * whose module is hidden on this Project are left out (CM-902). Each
 * section collapses to its header, remembered in this browser (CM-0025).
 */
export function ProjectDashboard({ projectId }: { projectId: string }) {
  const [duration, setDuration] = useState<Duration>(() =>
    presetDuration("last_12_months", browserToday()),
  );
  const [managing, setManaging] = useState(false);
  const problem = durationProblem(duration);

  return (
    <SectionCollapseProvider>
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
              <CollapseAllButton projectId={projectId} />
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
          <KpiTiles projectId={projectId} duration={duration} />
          <Suspense fallback={<DashboardSectionsSkeleton />}>
            <DashboardSections projectId={projectId} duration={duration} />
          </Suspense>
        </div>
        {managing ? (
          <Suspense fallback={null}>
            <ManageDashboard
              projectId={projectId}
              onClose={() => {
                setManaging(false);
              }}
            />
          </Suspense>
        ) : null}
      </div>
    </SectionCollapseProvider>
  );
}
