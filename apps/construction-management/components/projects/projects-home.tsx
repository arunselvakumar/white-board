"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Building2,
  CalendarDays,
  ChevronRight,
  CircleCheck,
  HardHat,
  MapPin,
  PauseCircle,
  Plus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  projectsQuery,
  type ProjectResponse,
  type ProjectStatus,
} from "@/src/queries/projects";

import {
  PROJECT_STATUS_LABELS,
  PROJECT_STATUS_ORDER,
  ProjectStatusBadge,
  projectDates,
  projectInitials,
} from "./project-status";

export const PROJECTS_PATH = "/app/projects";

type Filter = ProjectStatus | "all";

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  ...PROJECT_STATUS_ORDER.map((status) => ({
    value: status,
    label: PROJECT_STATUS_LABELS[status],
  })),
];

export function projectPath(id: string): string {
  return `${PROJECTS_PATH}/${encodeURIComponent(id)}`;
}

function newProjectLink(label = "New Project") {
  return (
    <Link href={`${PROJECTS_PATH}/new`} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      {label}
    </Link>
  );
}

const STATS: readonly {
  key: Filter;
  label: string;
  caption: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    key: "all",
    label: "All Projects",
    caption: "Every site in this Company",
    icon: Building2,
    tone: "bg-primary/12 text-primary",
  },
  {
    key: "ongoing",
    label: "Ongoing",
    caption: "Work on site now",
    icon: HardHat,
    tone: "bg-chart-3/12 text-chart-3",
  },
  {
    key: "on_hold",
    label: "On hold",
    caption: "Paused for now",
    icon: PauseCircle,
    tone: "bg-chart-4/12 text-chart-4",
  },
  {
    key: "completed",
    label: "Completed",
    caption: "Finished work",
    icon: CircleCheck,
    tone: "bg-chart-2/12 text-chart-2",
  },
];

function StatCard({
  label,
  value,
  caption,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  caption: string;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className="bg-card flex flex-col gap-4 rounded-2xl border p-4 shadow-xs sm:p-5">
      <p className="text-muted-foreground text-sm">{label}</p>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-11 ${tone}`}
        >
          <Icon className="size-5" />
        </span>
        <span className="text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {value}
        </span>
      </div>
      <p className="text-muted-foreground text-xs">{caption}</p>
    </div>
  );
}

const ROW_GRID =
  "md:grid md:grid-cols-[minmax(0,2fr)_8rem_minmax(0,1.3fr)_1rem] md:items-center md:gap-4";

function ProjectRow({ project }: { project: ProjectResponse }) {
  const dates = projectDates(project);
  return (
    <li>
      <Link
        href={projectPath(project.id)}
        className={`hover:bg-secondary/60 focus-visible:ring-ring/50 flex flex-col gap-3 rounded-xl px-3 py-3 transition-colors outline-none focus-visible:ring-3 ${ROW_GRID}`}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold"
          >
            {projectInitials(project.name)}
          </span>
          <div className="min-w-0 space-y-0.5">
            <p className="truncate font-semibold">{project.name}</p>
            {project.address == null ? (
              dates == null ? (
                <p className="text-muted-foreground text-sm">
                  No address or dates yet.
                </p>
              ) : null
            ) : (
              <p className="text-muted-foreground flex gap-1.5 text-sm">
                <MapPin
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0"
                />
                <span className="truncate">{project.address}</span>
              </p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pl-13 md:contents">
          <div>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="text-muted-foreground flex gap-1.5 text-sm">
            {dates == null ? null : (
              <>
                <CalendarDays
                  aria-hidden="true"
                  className="mt-0.5 size-3.5 shrink-0 md:hidden"
                />
                <span>{dates}</span>
              </>
            )}
          </p>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="text-muted-foreground hidden size-4 md:block"
        />
      </Link>
    </li>
  );
}

/**
 * Projects home (CM-204, `modules/03`): status totals, then every Project
 * in one list with status chips to filter it. The Owner sees every Project; a Member those assigned to
 * them.
 */
export function ProjectsHome() {
  const { data } = useSuspenseQuery(projectsQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const items =
    filter === "all"
      ? data.items
      : data.items.filter((item) => item.status === filter);

  return (
    <div className="w-full p-4 sm:p-6">
      <div className="w-full max-w-7xl space-y-6">
        <PageHeader
          title="Projects"
          meta="Every site your Company builds: labour, attendance and payments are kept per Project."
          actions={data.counts.all > 0 ? newProjectLink() : undefined}
        />
        {data.counts.all === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Building2 />
              </EmptyMedia>
              <EmptyTitle>No Projects yet</EmptyTitle>
              <EmptyDescription>
                Add your first Project to start recording labour, attendance and
                payments on site.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              {newProjectLink("Add your first Project")}
            </EmptyContent>
          </Empty>
        ) : (
          <>
            <div className="@container">
              <div className="grid grid-cols-2 gap-3 sm:gap-4 @4xl:grid-cols-4">
                {STATS.map((stat) => (
                  <StatCard
                    key={stat.key}
                    label={stat.label}
                    value={data.counts[stat.key]}
                    caption={stat.caption}
                    icon={stat.icon}
                    tone={stat.tone}
                  />
                ))}
              </div>
            </div>
            <section className="bg-card rounded-2xl border shadow-xs">
              <header className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5 pb-3">
                <h2 className="text-base tracking-tight">Your Projects</h2>
                <div className="-mx-5 max-w-full overflow-x-auto px-5 pb-1 sm:mx-0 sm:px-0">
                  <ToggleGroup
                    aria-label="Status"
                    value={[filter]}
                    onValueChange={(value: string[]) => {
                      const next = value[0] as Filter | undefined;
                      if (next != null) setFilter(next);
                    }}
                    variant="outline"
                    size="sm"
                  >
                    {FILTERS.map((item) => (
                      <ToggleGroupItem
                        key={item.value}
                        value={item.value}
                        className="whitespace-nowrap"
                      >
                        {item.label}{" "}
                        <span className="text-muted-foreground tabular-nums">
                          {data.counts[item.value]}
                        </span>
                      </ToggleGroupItem>
                    ))}
                  </ToggleGroup>
                </div>
              </header>
              {items.length === 0 ? (
                <p className="text-muted-foreground mx-5 mb-5 rounded-xl border border-dashed p-6 text-center text-sm">
                  No Projects are{" "}
                  {PROJECT_STATUS_LABELS[filter as ProjectStatus].toLowerCase()}
                  .
                </p>
              ) : (
                <div className="px-2 pb-2">
                  <div
                    aria-hidden="true"
                    className={`text-muted-foreground hidden border-b px-3 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase ${ROW_GRID}`}
                  >
                    <span>Project</span>
                    <span>Status</span>
                    <span>Dates</span>
                    <span />
                  </div>
                  <ul
                    aria-label="Projects"
                    className="divide-border/70 divide-y"
                  >
                    {items.map((project) => (
                      <ProjectRow key={project.id} project={project} />
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
