"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Building2,
  ClipboardCheck,
  HardHat,
  SearchCheck,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useState, useTransition, type ReactNode } from "react";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { MetricCard } from "@repo/ui/components/metric-card";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  COMPANY_DASHBOARD_COLUMNS,
  COMPANY_DASHBOARD_HEAD as HEAD,
  COMPANY_DASHBOARD_NUMBER as NUMBER,
  CompanyDashboardSkeleton,
} from "@/components/dashboard/dashboard-skeletons";
import { formatPaise } from "@/components/money/money-input";
import { DurationFilter } from "@/components/projects/dashboard/duration-filter";
import { ProjectProgressBar } from "@/components/projects/project-progress";
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
import {
  companyDashboardQuery,
  type CompanyDashboard as Dashboard,
  type CompanyDashboardProject,
} from "@/src/queries/company-dashboard";

/** A Project's Dashboard, where each row leads. */
export function projectDashboardPath(id: string): string {
  return `/app/projects/${encodeURIComponent(id)}/dashboard`;
}

/** `₹1,25,000` without `.00` on whole rupees. */
function rupees(paise: number): string {
  return formatPaise(paise).replace(/\.00$/, "");
}

const NONE = <span className="text-muted-foreground">—</span>;

function figure(value: number | null): ReactNode {
  return value ?? NONE;
}

type Total = {
  key: string;
  label: string;
  icon: LucideIcon;
  value: number | null;
  caption: string;
  /** Shown as rupees. */
  money?: boolean;
};

function totalsOf(data: Dashboard): Total[] {
  const { totals } = data;
  const without = (what: string) => `Needs ${what} on a Project`;
  const items: Total[] = [
    {
      key: "active",
      label: "Active Projects",
      icon: Building2,
      value: totals.activeProjects,
      caption: `Ongoing, of ${String(data.projects.length)} you can see`,
    },
    {
      key: "approvals",
      label: "Approvals waiting",
      icon: ClipboardCheck,
      value: totals.approvals,
      caption:
        totals.approvals == null
          ? "Nothing here for you to approve"
          : "Documents you may approve",
    },
    {
      key: "issues",
      label: "Pending Issues & Snags",
      icon: TriangleAlert,
      value: totals.pendingIssues,
      caption:
        totals.pendingIssues == null
          ? without("Issues & Snags read")
          : "Open, delayed included",
    },
    {
      key: "inspections",
      label: "Pending Inspections",
      icon: SearchCheck,
      value: totals.pendingInspections,
      caption:
        totals.pendingInspections == null
          ? without("Inspection Request read")
          : "Waiting for a decision",
    },
    {
      key: "labour",
      label: "Labours present today",
      icon: HardHat,
      value: totals.labourToday,
      caption:
        totals.labourToday == null
          ? without("Attendance read")
          : `On ${formatCalendarDate(data.today)}`,
    },
  ];
  if (data.financial)
    items.push({
      key: "due",
      label: "Amount due",
      icon: Wallet,
      value: totals.amountDue,
      caption: "On bills from parties, today",
      money: true,
    });
  return items;
}

function Totals({ data }: { data: Dashboard }) {
  return (
    <ul
      aria-label="Totals"
      className={cn(
        "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3",
        data.financial ? "xl:grid-cols-6" : "xl:grid-cols-5",
      )}
    >
      {totalsOf(data).map((total) => (
        <li key={total.key} className="flex min-w-0">
          <MetricCard
            className="w-full"
            label={total.label}
            icon={total.icon}
            value={
              total.value == null
                ? NONE
                : total.money === true
                  ? rupees(total.value).replace(/^₹/, "")
                  : total.value
            }
            unit={total.money === true && total.value != null ? "₹" : undefined}
            unitPlacement="start"
            caption={total.caption}
          />
        </li>
      ))}
    </ul>
  );
}

function Due({ paise }: { paise: number | null }) {
  return paise == null ? NONE : <>{rupees(paise)}</>;
}

function Issues({ row }: { row: CompanyDashboardProject }) {
  if (row.pendingIssues == null) return NONE;
  return (
    <>
      {row.pendingIssues}
      {row.delayedIssues != null && row.delayedIssues > 0 ? (
        <span className="text-destructive ml-1.5 text-xs">
          {row.delayedIssues} delayed
        </span>
      ) : null}
    </>
  );
}

/** Desktop: one table row per Project, the name linking to its Dashboard. */
function ProjectsTable({ data }: { data: Dashboard }) {
  return (
    <table className="hidden w-full table-fixed text-sm md:table">
      <caption className="sr-only">Your Projects</caption>
      <thead className="border-b">
        <tr>
          {COMPANY_DASHBOARD_COLUMNS.map((column) => (
            <th
              key={column.header}
              scope="col"
              className={cn(HEAD, column.className)}
            >
              {column.header}
            </th>
          ))}
          {data.financial ? (
            <th scope="col" className={cn(HEAD, "text-right")}>
              Due
            </th>
          ) : null}
        </tr>
      </thead>
      <tbody className="divide-border/70 divide-y">
        {data.projects.map((row) => (
          <tr key={row.id} className="hover:bg-secondary/60">
            <th scope="row" className="px-3 py-3 text-left font-medium">
              <Link
                href={projectDashboardPath(row.id)}
                className="focus-visible:ring-ring/50 block truncate rounded-sm underline-offset-4 outline-none hover:underline focus-visible:ring-3"
              >
                {row.name}
              </Link>
            </th>
            <td className="px-3 py-3">
              <ProjectStatusBadge status={row.status} />
            </td>
            <td className="px-3 py-3">
              {row.progress == null ? (
                <span className="text-muted-foreground text-xs">No tasks</span>
              ) : (
                <ProjectProgressBar progress={row.progress} />
              )}
            </td>
            <td className={NUMBER}>{figure(row.approvals)}</td>
            <td className={NUMBER}>
              <Issues row={row} />
            </td>
            <td className={NUMBER}>{figure(row.labourToday)}</td>
            {data.financial ? (
              <td className={cn(NUMBER, "font-medium")}>
                <Due paise={row.due} />
              </td>
            ) : null}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CardFigure({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="bg-muted/50 min-w-0 rounded-lg px-3 py-2">
      <dt className="text-muted-foreground truncate text-xs">{label}</dt>
      <dd className="text-base tabular-nums">{children}</dd>
    </div>
  );
}

/** Phone: one card per Project, the whole card linking to its Dashboard. */
function ProjectCards({ data }: { data: Dashboard }) {
  return (
    <ul aria-label="Your Projects" className="space-y-3 md:hidden">
      {data.projects.map((row) => (
        <li key={row.id}>
          <Link
            href={projectDashboardPath(row.id)}
            aria-label={row.name}
            className="bg-card hover:bg-secondary/60 focus-visible:ring-ring/50 block min-w-0 space-y-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
          >
            <div className="flex min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate font-semibold">{row.name}</span>
              <ProjectStatusBadge status={row.status} />
            </div>
            <ProjectProgressBar progress={row.progress} />
            <dl className="grid grid-cols-2 gap-2">
              <CardFigure label="Approvals">{figure(row.approvals)}</CardFigure>
              <CardFigure label="Pending issues">
                <Issues row={row} />
              </CardFigure>
              <CardFigure label="Labour today">
                {figure(row.labourToday)}
              </CardFigure>
              {data.financial ? (
                <CardFigure label="Due">
                  <Due paise={row.due} />
                </CardFigure>
              ) : null}
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function NoProjects() {
  return (
    <Empty className="bg-card border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Building2 />
        </EmptyMedia>
        <EmptyTitle>No Projects to show</EmptyTitle>
        <EmptyDescription>
          The Projects you are on show here with their approvals, issues, labour
          on site and amounts due.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Link
          href="/app/projects"
          className={buttonVariants({ variant: "outline" })}
        >
          Go to Projects
        </Link>
      </EmptyContent>
    </Empty>
  );
}

function Body({ duration }: { duration: Duration }) {
  const { data } = useSuspenseQuery(companyDashboardQuery(duration));
  if (data.projects.length === 0) return <NoProjects />;
  return (
    <div className="space-y-6">
      <Totals data={data} />
      <section
        aria-labelledby="company-dashboard-projects"
        className="bg-card min-w-0 rounded-2xl border p-2 shadow-xs sm:p-3"
      >
        <h2
          id="company-dashboard-projects"
          className="px-3 pt-3 pb-2 text-base tracking-tight"
        >
          Your Projects
        </h2>
        <div className="p-1 md:p-0">
          <ProjectCards data={data} />
          <ProjectsTable data={data} />
        </div>
      </section>
    </div>
  );
}

/**
 * The Company Dashboard (CM-902, ADR CM-0021 §4): totals across the
 * Projects the member can see and one row per Project linking to its
 * Dashboard, over a duration (the last 12 months by default). Amounts due
 * show only with Payments Read. Phones get cards; wider screens a table.
 */
export function CompanyDashboard() {
  const [duration, setDuration] = useState<Duration>(() =>
    presetDuration("last_12_months", browserToday()),
  );
  const [updating, startUpdate] = useTransition();
  const problem = durationProblem(duration);
  return (
    <div className="w-full min-w-0 p-4 sm:p-6">
      <div className="w-full max-w-7xl min-w-0 space-y-6">
        <PageHeader
          title="Dashboard"
          meta={
            <>
              Across your Projects · {formatCalendarDate(duration.from)} –{" "}
              {formatCalendarDate(duration.to)}
              {updating ? (
                <span className="ml-2" aria-live="polite">
                  Updating…
                </span>
              ) : null}
            </>
          }
          actions={
            <DurationFilter
              value={duration}
              onChange={(next) => {
                startUpdate(() => {
                  setDuration(next);
                });
              }}
            />
          }
        />
        {problem == null ? (
          <Suspense fallback={<CompanyDashboardSkeleton />}>
            <Body duration={duration} />
          </Suspense>
        ) : (
          <p role="alert" className="text-destructive text-sm">
            {problem}
          </p>
        )}
      </div>
    </div>
  );
}
