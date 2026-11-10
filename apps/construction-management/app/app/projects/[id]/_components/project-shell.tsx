"use client";

import {
  usePrefetchQuery,
  useQuery,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { EllipsisVertical, Pencil, Pin, TriangleAlert, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { Alert, AlertAction, AlertTitle } from "@repo/ui/components/alert";
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

import { QuerySuspense } from "@/components/query-suspense";

import { ProjectAvatar } from "./project-avatar";
import { ProjectShellHeaderSkeleton } from "./projects-skeletons";
import { clearProjectFlash, peekProjectFlash } from "./project-flash";
import { HideModulesDialog } from "./project-home-dialogs";
import { projectPath } from "./projects-home";
import { ProjectStatusBadge, projectDates } from "./project-status";

type OptionsDialog = "hide" | "backup" | null;

/**
 * Project options next to Edit (CM-411): Pin / Unpin for the member, Hide /
 * show modules for the Project (Update flag only), and Backup (CM-906; the
 * dialog offers the modules the member may view).
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
          {home.canHideModules ? <DropdownMenuSeparator /> : null}
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
 * A message left by the screen before, e.g. files that failed to upload,
 * shown on the next page of the Project and then forgotten.
 */
function ProjectFlash({ id }: { id: string }) {
  const [message, setMessage] = useState(() => peekProjectFlash(id));
  useEffect(() => {
    clearProjectFlash(id);
  }, [id]);
  if (message == null) return null;
  return (
    <div className="px-6 pt-4">
      <Alert className="max-w-4xl">
        <TriangleAlert aria-hidden="true" />
        <AlertTitle>{message}</AlertTitle>
        <AlertAction className="top-1.5 right-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Dismiss"
            onClick={() => {
              setMessage(null);
            }}
          >
            <X aria-hidden="true" />
          </Button>
        </AlertAction>
      </Alert>
    </div>
  );
}

/**
 * The project shell (CM-204, CM-411, ADR CM-0020): a slim header with the
 * Project's name, status, Project Type, dates, a pin mark, Edit and the
 * Project options, and any message from the screen before. The Project's
 * modules are in the sidebar (`ProjectNavMenu`); on a phone, where the
 * sidebar is a sheet, the header also shows the logo. There is no Project
 * home: opening a Project lands on the first module in the menu.
 */
export function ProjectShell({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  // Both reads start together; the header waits for the Project only.
  usePrefetchQuery(projectHomeQuery(id));
  const pathname = usePathname();
  // The header and the page load side by side: a page that suspends
  // keeps the header on screen (ADR-0047).
  return (
    <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col">
      <Suspense fallback={<ProjectShellHeaderSkeleton id={id} />}>
        <ProjectShellHeader id={id} />
      </Suspense>
      {/* Read on each page, but not on the bare Project path, which only
          forwards to the first module: the message waits for that page. */}
      {pathname === projectPath(id) ? null : (
        <ProjectFlash key={pathname} id={id} />
      )}
      <QuerySuspense>{children}</QuerySuspense>
    </div>
  );
}

function ProjectShellHeader({ id }: { id: string }) {
  const { data: project } = useSuspenseQuery(projectQuery(id));
  const { data: home } = useQuery(projectHomeQuery(id));
  const dates = projectDates(project);

  return (
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
          {home == null ? null : (
            <ProjectOptions id={id} name={project.name} home={home} />
          )}
        </div>
      </div>
    </header>
  );
}
