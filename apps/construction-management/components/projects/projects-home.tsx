"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Building2, CalendarDays, MapPin, Plus } from "lucide-react";
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

function ProjectCard({ project }: { project: ProjectResponse }) {
  const dates = projectDates(project);
  return (
    <li>
      <Link
        href={projectPath(project.id)}
        className="bg-card hover:border-primary/40 focus-visible:ring-ring/50 flex h-full flex-col gap-3 rounded-xl border p-4 transition-colors outline-none focus-visible:ring-3"
      >
        <div className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-lg text-sm font-semibold"
          >
            {projectInitials(project.name)}
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="truncate font-medium">{project.name}</p>
            <ProjectStatusBadge status={project.status} />
          </div>
        </div>
        {project.address == null && dates == null ? (
          <p className="text-muted-foreground text-sm">
            No address or dates yet.
          </p>
        ) : (
          <div className="text-muted-foreground space-y-1.5 text-sm">
            {project.address == null ? null : (
              <p className="flex gap-2">
                <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                <span className="line-clamp-2">{project.address}</span>
              </p>
            )}
            {dates == null ? null : (
              <p className="flex gap-2">
                <CalendarDays
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0"
                />
                <span>{dates}</span>
              </p>
            )}
          </div>
        )}
      </Link>
    </li>
  );
}

/**
 * Projects home (CM-204, `modules/03`): status chips with counts and a card
 * per Project. The Owner sees every Project; a Member those assigned to
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
    <div className="w-full p-6">
      <div className="w-full max-w-6xl space-y-6">
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
          <div className="space-y-4">
            <div className="-mx-6 overflow-x-auto px-6 pb-1">
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
            {items.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No Projects are{" "}
                {PROJECT_STATUS_LABELS[filter as ProjectStatus].toLowerCase()}.
              </p>
            ) : (
              <ul
                aria-label="Projects"
                className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              >
                {items.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
