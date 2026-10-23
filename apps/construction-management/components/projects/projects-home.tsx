"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Building2,
  CircleCheck,
  EllipsisVertical,
  FolderOpen,
  HardHat,
  PauseCircle,
  Plus,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { MetricCard } from "@repo/ui/components/metric-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { CheckInBanner } from "@/components/hrms/check-in-banner";
import { groupByClient } from "@/src/projects/domain/client-groups";
import { usePinProject } from "@/src/queries/project-home";
import {
  projectsQuery,
  type ProjectList,
  type ProjectStatus,
} from "@/src/queries/projects";

import { HideModulesDialog } from "./project-home-dialogs";
import { ProjectFolderCard } from "./project-folder-card";
import { PROJECT_FOLDER_GRID } from "./projects-skeletons";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER } from "./project-status";

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
}[] = [
  {
    key: "all",
    label: "All Projects",
    caption: "Every site in this Company",
    icon: Building2,
  },
  {
    key: "ongoing",
    label: "Ongoing",
    caption: "Work on site now",
    icon: HardHat,
  },
  {
    key: "on_hold",
    label: "On hold",
    caption: "Paused for now",
    icon: PauseCircle,
  },
  {
    key: "completed",
    label: "Completed",
    caption: "Finished work",
    icon: CircleCheck,
  },
];

type ProjectItem = ProjectList["items"][number];

/**
 * A Project's kebab on the Projects home (CM-411): Pin / Unpin, Edit and
 * Hide modules, in a square tinted with the folder's colour.
 */
function ProjectFolderMenu({
  project,
  className,
}: {
  project: ProjectItem;
  className: string;
}) {
  const router = useRouter();
  const pin = usePinProject();
  const [hiding, setHiding] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={cn("shrink-0 rounded-lg", className)}
              aria-label={`Options for ${project.name}`}
            />
          }
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem
            disabled={pin.isPending}
            onClick={() => {
              pin.mutate({ id: project.id, pinned: !project.pinned });
            }}
          >
            {project.pinned ? "Unpin" : "Pin to top"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              router.push(`${projectPath(project.id)}/edit`);
            }}
          >
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              setHiding(true);
            }}
          >
            Hide modules
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {hiding ? (
        <HideModulesDialog
          projectId={project.id}
          onClose={() => {
            setHiding(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * One client's folders on the Projects home (ADR CM-0027 §1): the client's
 * name and how many Projects it has, then their folders. Projects with no
 * client are "Uncategorised".
 */
function ClientGroupSection({
  id,
  clientName,
  projects,
}: {
  id: string;
  clientName: string | null;
  projects: readonly ProjectItem[];
}) {
  const name = clientName ?? "Uncategorised";
  const Icon = clientName == null ? FolderOpen : UserRound;
  return (
    <section aria-labelledby={id} className="space-y-1">
      <h3
        id={id}
        className="flex min-w-0 items-center gap-2 text-sm font-semibold tracking-tight"
      >
        <span
          aria-hidden="true"
          className="bg-secondary text-secondary-foreground flex size-7 shrink-0 items-center justify-center rounded-lg"
        >
          <Icon className="size-4" />
        </span>
        <span className="truncate">{name}</span>
        <span className="text-muted-foreground shrink-0 text-xs font-normal tabular-nums">
          {projects.length === 1
            ? "1 Project"
            : `${String(projects.length)} Projects`}
        </span>
      </h3>
      <ul aria-label={name} className={PROJECT_FOLDER_GRID}>
        {projects.map((project) => (
          <ProjectFolderCard
            key={project.id}
            project={project}
            href={projectPath(project.id)}
            menu={(chip) => (
              <ProjectFolderMenu project={project} className={chip} />
            )}
          />
        ))}
      </ul>
    </section>
  );
}

/**
 * Projects home (CM-204, `modules/03`): status totals (each one filters the list), then every Project
 * as a folder in its colour (ADR CM-0026), grouped by client (ADR CM-0027),
 * with status chips to filter them, the member's pinned Projects first in
 * each group (CM-411). The Owner sees every Project; a Member those assigned to
 * them. A Company with no Projects sees the same page with every figure at 0
 * and the empty state in place of the list (#108).
 */
export function ProjectsHome() {
  const { data } = useSuspenseQuery(projectsQuery);
  const [filter, setFilter] = useState<Filter>("all");
  const groupId = useId();
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
        <CheckInBanner />
        <div className="@container">
          <div className="grid grid-cols-2 gap-3 sm:gap-4 @4xl:grid-cols-4">
            {STATS.map((stat) => (
              <MetricCard
                key={stat.key}
                label={stat.label}
                icon={stat.icon}
                value={data.counts[stat.key]}
                caption={stat.caption}
                active={filter === stat.key}
                aria-pressed={filter === stat.key}
                onClick={() => {
                  setFilter(stat.key);
                }}
              />
            ))}
          </div>
        </div>
        <section className="bg-card @container rounded-2xl border shadow-xs">
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
          {data.counts.all === 0 ? (
            <Empty className="mx-5 mb-5 w-auto border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Building2 />
                </EmptyMedia>
                <EmptyTitle>No Projects yet</EmptyTitle>
                <EmptyDescription>
                  Add your first Project to start recording labour, attendance
                  and payments on site.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                {newProjectLink("Add your first Project")}
              </EmptyContent>
            </Empty>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground mx-5 mb-5 rounded-xl border border-dashed p-6 text-center text-sm">
              No Projects are{" "}
              {PROJECT_STATUS_LABELS[filter as ProjectStatus].toLowerCase()}.
            </p>
          ) : (
            <div
              role="group"
              aria-label="Projects"
              className="space-y-7 px-5 pt-1 pb-5"
            >
              {groupByClient(items, data.items).map((group, index) => (
                <ClientGroupSection
                  key={group.key}
                  id={`${groupId}-${String(index)}`}
                  clientName={group.clientName}
                  projects={group.projects}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
