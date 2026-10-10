"use client";

import {
  usePrefetchQuery,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { EllipsisVertical, Pencil, Pin } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { PROJECT_MODULES } from "@/src/projects/domain/project-modules";
import {
  projectTypeLabel,
  type ProjectStructure,
} from "@/src/projects/domain/project-type";
import {
  projectHomeQuery,
  usePinProject,
  type ProjectHome,
} from "@/src/queries/project-home";
import { projectQuery } from "@/src/queries/projects";

import { ProjectAvatar } from "./project-avatar";
import { ArrangeTilesDialog, HideModulesDialog } from "./project-home-dialogs";
import { PROJECTS_PATH, projectPath } from "./projects-home";
import { ProjectStatusBadge, projectDates } from "./project-status";

/**
 * The section bar: Home, then the member's modules in their order. Until
 * the home loads (or if it cannot), every module of the Project's
 * structure in the default order; each page checks access itself.
 */
export function projectSections(
  home: ProjectHome | undefined,
  structure: ProjectStructure,
) {
  const modules =
    home?.modules.filter((module) => !module.hidden) ??
    PROJECT_MODULES.filter(
      (module) => !("structure" in module) || module.structure === structure,
    );
  return [
    { segment: "", label: "Home" },
    ...modules.map(({ segment, label }) => ({ segment, label })),
  ];
}

function activeSegment(
  pathname: string,
  base: string,
  segments: readonly string[],
): string {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const segment = rest.split("/").find(Boolean) ?? "";
  // Edit, and any page without a section, belong to Home.
  return segments.includes(segment) ? segment : "";
}

type OptionsDialog = "hide" | "arrange" | null;

/**
 * Project options next to Edit (CM-411): Pin / Unpin for the member, Hide /
 * show modules for the Project (Update flag only), Arrange tiles.
 */
function ProjectOptions({ id, home }: { id: string; home: ProjectHome }) {
  const pin = usePinProject();
  const [dialog, setDialog] = useState<OptionsDialog>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Project options"
            />
          }
        >
          <EllipsisVertical />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem
            disabled={pin.isPending}
            onClick={() => {
              pin.mutate({ id, pinned: !home.pinned });
            }}
          >
            {home.pinned ? "Unpin" : "Pin to top"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {home.canHideModules ? (
            <DropdownMenuItem
              onClick={() => {
                setDialog("hide");
              }}
            >
              Hide / show modules
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => {
              setDialog("arrange");
            }}
          >
            Arrange tiles
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog === "hide" ? (
        <HideModulesDialog
          projectId={id}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog === "arrange" ? (
        <ArrangeTilesDialog
          projectId={id}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The project shell (CM-204, CM-411): the logo when there is one, name,
 * status, Project Type, a pin mark, Edit and the Project options above a
 * section bar built from the member's Project home: Home and the modules
 * they may open, in their tile order. The bar scrolls sideways on a phone;
 * the page never does.
 */
export function ProjectShell({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  // Both reads start together; the shell waits for the Project only.
  usePrefetchQuery(projectHomeQuery(id));
  const { data: project } = useSuspenseQuery(projectQuery(id));
  const { data: home } = useQuery(projectHomeQuery(id));
  const pathname = usePathname();
  const base = projectPath(id);
  const sections = projectSections(home, project.structure);
  const current = activeSegment(
    pathname,
    base,
    sections.map((section) => section.segment),
  );
  const dates = projectDates(project);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <div className="w-full min-w-0 space-y-4 px-6 pt-6">
        <div className="w-full max-w-6xl">
          <PageHeader
            back={{ label: "Projects", href: PROJECTS_PATH }}
            title={project.name}
            leading={
              project.logoUrl == null ? undefined : (
                <ProjectAvatar
                  name={project.name}
                  logoUrl={project.logoUrl}
                  className="size-12 sm:size-14"
                />
              )
            }
            meta={
              <span className="flex flex-wrap items-center gap-2">
                <ProjectStatusBadge status={project.status} />
                {project.projectType == null ? null : (
                  <span>{projectTypeLabel(project.projectType)}</span>
                )}
                {dates == null ? null : <span>{dates}</span>}
                {home?.pinned === true ? (
                  <span className="inline-flex items-center gap-1">
                    <Pin aria-hidden="true" className="size-3.5" />
                    Pinned
                  </span>
                ) : null}
              </span>
            }
            actions={
              <div className="flex items-center gap-2">
                <Link
                  href={`${base}/edit`}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
                {home == null ? null : <ProjectOptions id={id} home={home} />}
              </div>
            }
          />
        </div>
        <nav
          aria-label="Project sections"
          className="-mx-6 overflow-x-auto overscroll-x-contain border-b px-6"
        >
          <ul className="flex w-max gap-1">
            {sections.map((section) => {
              const href =
                section.segment === "" ? base : `${base}/${section.segment}`;
              const active = section.segment === current;
              return (
                <li key={section.label}>
                  <Link
                    href={href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "focus-visible:ring-ring/50 -mb-px inline-flex h-10 items-center border-b-2 px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none focus-visible:ring-3",
                      active
                        ? "border-primary text-foreground"
                        : "text-muted-foreground hover:text-foreground border-transparent",
                    )}
                  >
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
      {children}
    </div>
  );
}
