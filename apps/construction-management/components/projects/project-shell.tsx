"use client";

import {
  usePrefetchQuery,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { EllipsisVertical, Pencil, Pin } from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";

import { projectTypeLabel } from "@/src/projects/domain/project-type";
import {
  projectHomeQuery,
  usePinProject,
  type ProjectHome,
} from "@/src/queries/project-home";
import { projectQuery } from "@/src/queries/projects";

import { ProjectBackupDialog } from "@/components/backups/backup-dialog";

import { ProjectAvatar } from "./project-avatar";
import { ArrangeTilesDialog, HideModulesDialog } from "./project-home-dialogs";
import { projectPath } from "./projects-home";
import { ProjectStatusBadge, projectDates } from "./project-status";

type OptionsDialog = "hide" | "arrange" | "backup" | null;

/**
 * Project options next to Edit (CM-411): Pin / Unpin for the member, Hide /
 * show modules for the Project (Update flag only), Arrange tiles, and
 * Backup (CM-906; the dialog offers the modules the member may view).
 */
function ProjectOptions({
  id,
  name,
  home,
}: {
  id: string;
  name: string;
  home: ProjectHome;
}) {
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
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => {
              setDialog("backup");
            }}
          >
            Backup…
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
      {dialog === "backup" ? (
        <ProjectBackupDialog
          projectId={id}
          projectName={name}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * The project shell (CM-204, CM-411, ADR CM-0020): a slim header with the
 * Project's name, status, Project Type, dates, a pin mark, Edit and the
 * Project options. The Project's modules are in the sidebar
 * (`ProjectNavMenu`); on a phone, where the sidebar is a sheet, the header
 * also shows the logo.
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
  const dates = projectDates(project);

  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <header className="border-b px-6 py-3">
        <div className="flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 items-center gap-3">
            {project.logoUrl == null ? null : (
              <ProjectAvatar
                name={project.name}
                logoUrl={project.logoUrl}
                className="size-9 md:hidden"
              />
            )}
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-lg font-semibold tracking-tight break-words">
                {project.name}
              </h1>
              <span className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
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
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`${projectPath(id)}/edit`}
              className={buttonVariants({ variant: "outline" })}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Link>
            {home == null ? null : <ProjectOptions id={id} name={project.name} home={home} />}
          </div>
        </div>
      </header>
      {children}
    </div>
  );
}
