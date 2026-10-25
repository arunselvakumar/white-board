"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Building2,
  CircleCheck,
  CircleDashed,
  EllipsisVertical,
  EyeOff,
  FolderOpen,
  HardHat,
  Palette,
  PauseCircle,
  Pencil,
  Pin,
  PinOff,
  Plus,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useId, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { FilterTabs } from "@repo/ui/components/filter-tabs";
import { MetricCard } from "@repo/ui/components/metric-card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { CheckInBanner } from "@/components/hrms/check-in-banner";
import { groupByClient } from "@/src/projects/domain/client-groups";
import {
  PROJECT_COLORS,
  type ProjectColor,
} from "@/src/projects/domain/project-color";
import { usePinProject, useSetProjectColor } from "@/src/queries/project-home";
import {
  projectsQuery,
  type ProjectList,
  type ProjectStatus,
} from "@/src/queries/projects";

import { HideModulesDialog } from "./project-home-dialogs";
import { ProjectFolderCard } from "./project-folder-card";
import { PROJECT_FOLDER_TINTS } from "./project-folder-colors";
import { PROJECT_FOLDER_GRID } from "./projects-skeletons";
import { PROJECT_STATUS_LABELS, PROJECT_STATUS_ORDER } from "./project-status";

export const PROJECTS_PATH = "/app/projects";

type Filter = ProjectStatus | "all";

const STATUS_ICONS: Record<Filter, LucideIcon> = {
  all: Building2,
  ongoing: HardHat,
  not_started: CircleDashed,
  on_hold: PauseCircle,
  completed: CircleCheck,
};

const FILTERS: readonly { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  ...PROJECT_STATUS_ORDER.map((status) => ({
    value: status,
    label: PROJECT_STATUS_LABELS[status],
  })),
];

/**
 * The status filter lives in the address (`?status=on_hold`), so a filtered
 * list can be shared, reloaded and left with Back; "All" is no parameter.
 */
const statusFilter = parseAsStringLiteral([
  "all",
  ...PROJECT_STATUS_ORDER,
] as const).withDefault("all");

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
}[] = [
  {
    key: "all",
    label: "All Projects",
    caption: "Every site in this Company",
  },
  {
    key: "ongoing",
    label: "Ongoing",
    caption: "Work on site now",
  },
  {
    key: "on_hold",
    label: "On hold",
    caption: "Paused for now",
  },
  {
    key: "completed",
    label: "Completed",
    caption: "Finished work",
  },
];

type ProjectItem = ProjectList["items"][number];

/**
 * A Project's kebab on the Projects home (CM-411): Pin / Unpin, Edit,
 * Change colour (the palette of the Project form, ADR CM-0026 §5) and
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
  const setColor = useSetProjectColor();
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
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem
            disabled={pin.isPending}
            onClick={() => {
              pin.mutate({ id: project.id, pinned: !project.pinned });
            }}
          >
            {project.pinned ? (
              <PinOff aria-hidden="true" />
            ) : (
              <Pin aria-hidden="true" />
            )}
            {project.pinned ? "Unpin" : "Pin to top"}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => {
              router.push(`${projectPath(project.id)}/edit`);
            }}
          >
            <Pencil aria-hidden="true" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette aria-hidden="true" />
              Change colour
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent aria-label="Colour">
              <DropdownMenuRadioGroup
                value={project.color}
                onValueChange={(color: ProjectColor) => {
                  if (color !== project.color)
                    setColor.mutate({ id: project.id, color });
                }}
              >
                {PROJECT_COLORS.map((color) => (
                  <DropdownMenuRadioItem key={color.key} value={color.key}>
                    <span
                      aria-hidden="true"
                      className={cn(
                        "size-4 shrink-0 rounded-full border border-black/10 dark:border-white/15",
                        PROJECT_FOLDER_TINTS[color.key].swatch,
                      )}
                    />
                    {color.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setHiding(true);
            }}
          >
            <EyeOff aria-hidden="true" />
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
 * client are "Uncategorised". The heading names the section once, so the
 * list inside it has no label of its own.
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
    <section aria-labelledby={id} className="space-y-4">
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
        <span className="sr-only">, </span>
        <span className="text-muted-foreground shrink-0 text-xs font-normal tabular-nums">
          {projects.length === 1
            ? "1 Project"
            : `${String(projects.length)} Projects`}
        </span>
      </h3>
      <ul className={PROJECT_FOLDER_GRID}>
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
 * with status tabs to filter them (kept in `?status=`), the member's pinned Projects first in
 * each group (CM-411). The Owner sees every Project; a Member those assigned to
 * them. A Company with no Projects sees the same page with every figure at 0
 * and the empty state in place of the list (#108).
 */
export function ProjectsHome() {
  const { data } = useSuspenseQuery(projectsQuery);
  const [filter, setFilter] = useQueryState("status", statusFilter);
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
                icon={STATUS_ICONS[stat.key]}
                value={data.counts[stat.key]}
                caption={stat.caption}
                active={filter === stat.key}
                aria-pressed={filter === stat.key}
                onClick={() => {
                  void setFilter(stat.key);
                }}
              />
            ))}
          </div>
        </div>
        <section className="bg-card @container rounded-2xl border shadow-xs">
          <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-5 pt-4 pb-3">
            <h2 className="text-base tracking-tight">Your Projects</h2>
            <FilterTabs
              aria-label="Status"
              value={filter}
              onValueChange={(next) => {
                void setFilter(next);
              }}
              items={FILTERS.map((item) => ({
                ...item,
                icon: STATUS_ICONS[item.value],
                count: data.counts[item.value],
              }))}
              className="-mx-2 max-w-full sm:mx-0"
            />
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
              className="space-y-8 px-5 pt-2 pb-5"
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
