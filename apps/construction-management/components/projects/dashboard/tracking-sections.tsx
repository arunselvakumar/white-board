"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  ListChecks,
  SearchCheck,
  TriangleAlert,
} from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { MetricCard } from "@repo/ui/components/metric-card";

import { formatPaise } from "@/components/money/money-input";
import { formatCalendarDate } from "@/components/projects/project-status";
import { STATUS_STYLES } from "@/components/tracking/tasks/task-parts";
import type { Duration } from "@/lib/dashboard-duration";
import {
  trackingDashboardQuery,
  type InspectionDashboard,
  type IssueDashboard,
  type TaskDashboard,
} from "@/src/queries/tracking-dashboard";
import { tasksPath } from "@/src/queries/tracking-tasks";
import {
  ISSUE_STATUS_LABELS,
  ISSUE_STATUSES,
  type IssueStatus,
} from "@/src/tracking/domain/issue";
import {
  TASK_STATUS_LABELS,
  TASK_STATUSES,
} from "@/src/tracking/domain/task-progress";
import { TRACKING_PRIORITIES } from "@/src/tracking/domain/tracking-documents";

import { Fact, Rupees, Section, denied } from "./dashboard-parts";
import {
  MetricCaptionSkeleton,
  MetricFigureSkeleton,
  SectionSkeleton,
} from "./dashboard-skeletons";
import {
  CountBars,
  Gauge,
  Legend,
  percentText,
  StackedBar,
  type BarItem,
} from "./tracking-charts";

function projectPath(projectId: string, segment: string): string {
  return `/app/projects/${encodeURIComponent(projectId)}/${segment}`;
}

function SectionLink({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="text-primary text-sm font-medium underline-offset-4 hover:underline"
    >
      {children}
    </Link>
  );
}

/** Issue status colours, matching the list's chips (CM-803). */
const ISSUE_SWATCHES: Record<IssueStatus, string> = {
  pending: "bg-amber-500",
  delayed: "bg-red-500",
  solved: "bg-emerald-500",
  closed: "bg-slate-400 dark:bg-slate-500",
};

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** The Project Progress % gauge's caption: which weight it used. */
export function weightingCaption(progress: TaskDashboard["progress"]): string {
  if (progress.weighting === "price") return "Weighted by Total Price";
  if (progress.weighting === "duration") return "Weighted by duration";
  return "No tasks yet";
}

/**
 * Value Earned By Task (CM-805, Task Financial): each top-most task of the
 * period with its value as the track and the earned value filled in, the
 * figures written beside it.
 */
export function ValueEarnedChart({
  value,
}: {
  value: NonNullable<TaskDashboard["valueEarned"]>;
}) {
  const titleId = useId();
  const max = Math.max(1, ...value.tasks.map((task) => task.value));
  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <figcaption id={titleId} className="text-sm font-semibold">
        Value earned by task
      </figcaption>
      {value.tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No priced task was added in this period.
        </p>
      ) : (
        <>
          <Legend
            items={[
              { key: "value", label: "Task value", swatch: "bg-chart-2" },
              { key: "earned", label: "Earned value", swatch: "bg-primary" },
            ]}
          />
          <ol className="space-y-2.5" aria-labelledby={titleId}>
            {value.tasks.map((task) => (
              <li key={task.id} className="min-w-0 space-y-1">
                <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="text-muted-foreground text-xs">
                      {task.label}
                    </span>{" "}
                    {task.name}
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                    <span className="text-foreground font-medium">
                      {formatPaise(task.earned)}
                    </span>{" "}
                    of {formatPaise(task.value)}
                  </span>
                </div>
                <div
                  className="bg-muted h-2 w-full rounded-full"
                  aria-hidden="true"
                >
                  <div
                    className="bg-chart-2 relative h-2 rounded-full"
                    style={{
                      width:
                        task.value === 0
                          ? "0"
                          : `max(2px, ${String((task.value / max) * 100)}%)`,
                    }}
                  >
                    <div
                      className="bg-primary absolute inset-y-0 left-0 rounded-full"
                      style={{
                        width:
                          task.value === 0
                            ? "0"
                            : `${String((task.earned / task.value) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {value.more > 0 ? (
            <p className="text-muted-foreground text-xs">
              And {plural(value.more, "more task", "more tasks")}, counted in
              the totals.
            </p>
          ) : null}
        </>
      )}
    </figure>
  );
}

/** The most delayed leaf tasks, each opening its task. */
export function MostDelayedTasks({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: TaskDashboard["mostDelayed"];
}) {
  const titleId = useId();
  return (
    <div className="min-w-0 space-y-3">
      <h3 id={titleId} className="text-sm font-semibold">
        Most delayed tasks
      </h3>
      {tasks.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No task is past its Due Date.
        </p>
      ) : (
        <ol aria-labelledby={titleId} className="divide-y">
          {tasks.map((task) => (
            <li
              key={task.id}
              className="flex min-w-0 items-center justify-between gap-3 py-2 text-sm"
            >
              <span className="min-w-0">
                <Link
                  href={tasksPath(projectId, task.id)}
                  className="block truncate font-medium underline-offset-4 hover:underline"
                >
                  <span className="text-muted-foreground text-xs font-normal">
                    {task.label}
                  </span>{" "}
                  {task.name}
                </Link>
                <span className="text-muted-foreground block text-xs">
                  Due {formatCalendarDate(task.dueDate)} ·{" "}
                  {percentText(task.progressPct)} done
                </span>
              </span>
              <span className="text-destructive shrink-0 text-xs font-medium tabular-nums">
                {plural(task.daysLate, "day late", "days late")}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The Task section's body once loaded (stories render it directly). */
export function TaskSectionBody({
  projectId,
  tasks,
}: {
  projectId: string;
  tasks: TaskDashboard;
}) {
  const statusBars: BarItem[] = TASK_STATUSES.map((status) => ({
    key: status,
    label: TASK_STATUS_LABELS[status],
    count: tasks.byStatus[status],
    swatch: STATUS_STYLES[status].swatch,
  }));
  return (
    <div className="space-y-5">
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <div className="space-y-2">
          <Gauge
            label="Project Progress"
            value={tasks.progress.pct}
            caption={weightingCaption(tasks.progress)}
          />
          <p className="text-muted-foreground text-center text-xs">
            Every task of the Project, whatever the period.
          </p>
        </div>
        <div className="min-w-0 space-y-3">
          <dl className="grid grid-cols-2 gap-2">
            <Fact label="Tasks added" icon={ListChecks}>
              {tasks.total}
            </Fact>
            <Fact label="Delayed" icon={TriangleAlert}>
              {tasks.byStatus.delayed}
            </Fact>
          </dl>
          <CountBars
            title="Tasks by status"
            items={statusBars}
            empty="No task was added in this period."
          />
        </div>
      </div>
      {tasks.valueEarned == null ? null : (
        <div className="space-y-3">
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <Fact label="Total task value">
              <Rupees paise={tasks.valueEarned.totals.value} />
            </Fact>
            <Fact label="Total earned value">
              <Rupees paise={tasks.valueEarned.totals.earned} />
            </Fact>
          </dl>
          <ValueEarnedChart value={tasks.valueEarned} />
        </div>
      )}
      <MostDelayedTasks projectId={projectId} tasks={tasks.mostDelayed} />
      <p className="text-muted-foreground text-xs">
        Counts, values and delays are of the tasks added in this period
        {tasks.viewAll
          ? "."
          : " that you created or are assigned to (you do not have View all)."}
      </p>
    </div>
  );
}

/**
 * Task (CM-805, ADR CM-0019 §14): the Project Progress % gauge naming its
 * weighting, tasks by status, Value Earned By Task with Financial and the
 * most delayed tasks. Needs Task Read on the Project.
 */
export function TaskSection({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, isPending, error } = useQuery(
    trackingDashboardQuery(projectId, duration),
  );
  return (
    <Section
      id="dashboard-task"
      title="Task"
      aside={<SectionLink href={tasksPath(projectId)}>Tasks</SectionLink>}
    >
      {isPending ? (
        <SectionSkeleton
          label="Loading Tasks"
          className="grid grid-cols-2 gap-2"
          chart
          facts={[
            { label: "Tasks added", icon: ListChecks },
            { label: "Delayed", icon: TriangleAlert },
          ]}
        />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Tasks need the Dashboard permission on this Project."
            : "Tasks could not be loaded."}
        </p>
      ) : data.tasks == null ? (
        <p className="text-muted-foreground text-sm">
          Tasks need the Task permission on this Project.
        </p>
      ) : (
        <TaskSectionBody projectId={projectId} tasks={data.tasks} />
      )}
    </Section>
  );
}

/**
 * Assignee-wise issues by status: one stacked bar per assignee, its counts
 * written under it, so the colours always come with words.
 */
export function AssigneeIssues({
  rows,
}: {
  rows: IssueDashboard["byAssignee"];
}) {
  const titleId = useId();
  const max = Math.max(1, ...rows.map((row) => row.total));
  return (
    <figure aria-labelledby={titleId} className="min-w-0 space-y-3">
      <figcaption id={titleId} className="text-sm font-semibold">
        Issues by assignee
      </figcaption>
      {rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          No issue was raised in this period.
        </p>
      ) : (
        <>
          <Legend
            items={ISSUE_STATUSES.map((status) => ({
              key: status,
              label: ISSUE_STATUS_LABELS[status],
              swatch: ISSUE_SWATCHES[status],
            }))}
          />
          <ol className="space-y-3" aria-labelledby={titleId}>
            {rows.map((row) => (
              <li key={row.memberId ?? "none"} className="min-w-0 space-y-1">
                <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">
                    {row.memberId == null
                      ? "Not assigned"
                      : (row.name ?? "A removed Team Member")}
                  </span>
                  <span className="shrink-0 font-medium tabular-nums">
                    {row.total}
                  </span>
                </div>
                <StackedBar
                  max={max}
                  segments={ISSUE_STATUSES.map((status) => ({
                    key: status,
                    label: ISSUE_STATUS_LABELS[status],
                    count: row[status],
                    swatch: ISSUE_SWATCHES[status],
                  }))}
                />
                <p className="text-muted-foreground text-xs">
                  {ISSUE_STATUSES.filter((status) => row[status] > 0)
                    .map(
                      (status) =>
                        `${String(row[status])} ${ISSUE_STATUS_LABELS[status].toLowerCase()}`,
                    )
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        </>
      )}
    </figure>
  );
}

/** The Issue & Snag section's body once loaded (stories render it directly). */
export function IssueSectionBody({ issues }: { issues: IssueDashboard }) {
  const empty = "No issue was raised in this period.";
  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Fact label="Issues raised" icon={ClipboardList}>
          {issues.total}
        </Fact>
        <Fact label="Pending, delayed included" icon={Clock}>
          {issues.byStatus.pending + issues.byStatus.delayed}
        </Fact>
      </dl>
      <div className="grid min-w-0 gap-5 lg:grid-cols-2">
        <CountBars
          title="Issues by status"
          empty={empty}
          items={ISSUE_STATUSES.map((status) => ({
            key: status,
            label: ISSUE_STATUS_LABELS[status],
            count: issues.byStatus[status],
            swatch: ISSUE_SWATCHES[status],
          }))}
        />
        <CountBars
          title="Issues by priority"
          empty={empty}
          items={[
            ...TRACKING_PRIORITIES.map((priority) => ({
              key: priority.key,
              label: priority.label,
              count: issues.byPriority[priority.key],
              color: priority.color,
            })),
            {
              key: "none",
              label: "No priority",
              count: issues.byPriority.none,
              swatch: "bg-slate-300 dark:bg-slate-600",
            },
          ]}
        />
        <CountBars
          title="Issues by category"
          empty={empty}
          items={issues.byCategory.map((category) => ({
            key: category.categoryId ?? "none",
            label:
              category.categoryId == null
                ? "No category"
                : (category.name ?? "A removed category"),
            count: category.count,
            swatch:
              category.categoryId == null
                ? "bg-slate-300 dark:bg-slate-600"
                : "bg-primary",
          }))}
        />
        <AssigneeIssues rows={issues.byAssignee} />
      </div>
      {issues.viewAll ? null : (
        <p className="text-muted-foreground text-xs">
          Only the issues you raised or are assigned to (you do not have View
          all).
        </p>
      )}
    </div>
  );
}

/**
 * Issue & Snag (CM-805): issues raised in the period by status, priority,
 * category and assignee. Needs Issues & Snags Read on the Project.
 */
export function IssueSection({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, isPending, error } = useQuery(
    trackingDashboardQuery(projectId, duration),
  );
  return (
    <Section
      id="dashboard-issue_snag"
      title="Issue & Snag"
      aside={
        <SectionLink href={projectPath(projectId, "issues")}>
          Issues & Snags
        </SectionLink>
      }
    >
      {isPending ? (
        <SectionSkeleton
          label="Loading Issues & Snags"
          chart
          facts={[
            { label: "Issues raised", icon: ClipboardList },
            { label: "Pending, delayed included", icon: Clock },
          ]}
        />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Issues & Snags need the Dashboard permission on this Project."
            : "Issues & Snags could not be loaded."}
        </p>
      ) : data.issues == null ? (
        <p className="text-muted-foreground text-sm">
          Issues & Snags need the Issues and snags permission on this Project.
        </p>
      ) : (
        <IssueSectionBody issues={data.issues} />
      )}
    </Section>
  );
}

/** The Inspection Request section's body once loaded. */
export function InspectionSectionBody({
  inspections,
}: {
  inspections: InspectionDashboard;
}) {
  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-center">
      <dl className="grid grid-cols-2 gap-2">
        <Fact label="Total" icon={SearchCheck}>
          {inspections.total}
        </Fact>
        <Fact label="Approved" icon={CircleCheck}>
          {inspections.approved}
        </Fact>
        <Fact label="Pending for approval" icon={Clock}>
          {inspections.pending}
        </Fact>
        <Fact label="Rejected" icon={CircleX}>
          {inspections.rejected}
        </Fact>
      </dl>
      <Gauge
        label="Success Rate"
        value={inspections.successRate}
        caption={
          inspections.successRate == null
            ? "No request was approved or rejected in this period."
            : `Approved of ${plural(
                inspections.approved + inspections.rejected,
                "decided request",
                "decided requests",
              )}`
        }
      />
    </div>
  );
}

/**
 * Inspection Request (CM-805): total, approved, pending and rejected in
 * the period, and the Success Rate = Approved ÷ (Approved + Rejected), "—"
 * with none decided. Needs Inspection Request Read on the Project.
 */
export function InspectionSection({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  const { data, isPending, error } = useQuery(
    trackingDashboardQuery(projectId, duration),
  );
  return (
    <Section
      id="dashboard-inspection_request"
      title="Inspection Request"
      aside={
        <SectionLink href={projectPath(projectId, "inspections")}>
          Inspection Requests
        </SectionLink>
      }
    >
      {isPending ? (
        <SectionSkeleton
          label="Loading Inspection Requests"
          className="grid grid-cols-2 gap-2"
          facts={[
            { label: "Total", icon: SearchCheck },
            { label: "Approved", icon: CircleCheck },
            { label: "Pending for approval", icon: Clock },
            { label: "Rejected", icon: CircleX },
          ]}
        />
      ) : error != null ? (
        <p className="text-muted-foreground text-sm">
          {denied(error)
            ? "Inspection Requests need the Dashboard permission on this Project."
            : "Inspection Requests could not be loaded."}
        </p>
      ) : data.inspections == null ? (
        <p className="text-muted-foreground text-sm">
          Inspection Requests need the Inspection Request permission on this
          Project.
        </p>
      ) : (
        <InspectionSectionBody inspections={data.inspections} />
      )}
    </Section>
  );
}

/** A KPI tile fed by the tracking dashboard read. */
function TrackingTile({
  projectId,
  duration,
  label,
  icon,
  segment,
  pick,
  caption,
  needs,
}: {
  projectId: string;
  duration: Duration;
  label: string;
  icon: typeof SearchCheck;
  segment: string;
  pick: (kpis: {
    pendingIssues: number | null;
    pendingInspections: number | null;
  }) => number | null;
  caption: string;
  needs: string;
}) {
  const { data, error } = useQuery(trackingDashboardQuery(projectId, duration));
  const count = data == null ? null : pick(data.kpis);
  return (
    <li className="flex min-w-0">
      <MetricCard
        className="w-full"
        label={label}
        icon={icon}
        value={
          count ??
          (data == null && error == null ? (
            <MetricFigureSkeleton />
          ) : (
            <span className="text-muted-foreground">—</span>
          ))
        }
        caption={
          error != null ? (
            "Could not be loaded"
          ) : data == null ? (
            <MetricCaptionSkeleton />
          ) : count == null ? (
            needs
          ) : (
            caption
          )
        }
        render={
          count == null ? undefined : (
            <Link href={projectPath(projectId, segment)} />
          )
        }
      />
    </li>
  );
}

/** Pending Issues & Snags (CM-805): open in the period, delayed included. */
export function PendingIssuesTile({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  return (
    <TrackingTile
      projectId={projectId}
      duration={duration}
      label="Pending Issues & Snags"
      icon={TriangleAlert}
      segment="issues"
      pick={(kpis) => kpis.pendingIssues}
      caption="Open, delayed included"
      needs="Needs Issues & Snags read"
    />
  );
}

/** Pending Inspections (CM-805): pending for approval in the period. */
export function PendingInspectionsTile({
  projectId,
  duration,
}: {
  projectId: string;
  duration: Duration;
}) {
  return (
    <TrackingTile
      projectId={projectId}
      duration={duration}
      label="Pending Inspections"
      icon={SearchCheck}
      segment="inspections"
      pick={(kpis) => kpis.pendingInspections}
      caption="Pending for approval"
      needs="Needs Inspection Request read"
    />
  );
}
