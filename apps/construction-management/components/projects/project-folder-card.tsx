import { CalendarDays, MapPin, Pin } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

import { projectTypeLabel } from "@/src/projects/domain/project-type";
import type { ProjectList } from "@/src/queries/projects";

import { ProjectAvatar } from "./project-avatar";
import { PROJECT_FOLDER_TINTS } from "./project-folder-colors";
import { ProjectProgressBar } from "./project-progress";
import { ProjectStatusBadge, projectDates } from "./project-status";

type ProjectItem = ProjectList["items"][number];

/**
 * The back panel's tab and the paper peeking out above the front: drawn
 * behind the front panel, in the Project's colour (ADR CM-0026 §3). When
 * the folder is hovered or focused the paper slides up out of it; the
 * front stays put (ADR CM-0027 §2).
 */
function FolderBack({ back }: { back: string }) {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div
        className={cn("absolute inset-x-0 top-3 bottom-0 rounded-2xl", back)}
      />
      <div
        className={cn(
          "absolute top-0 left-0 h-6 w-2/5 rounded-t-xl after:absolute after:top-0 after:-right-2.5 after:h-full after:w-6 after:skew-x-[28deg] after:rounded-tr-lg after:bg-inherit",
          back,
        )}
      />
      <div className="bg-card absolute inset-x-4 top-4 bottom-4 rounded-lg border shadow-xs transition-transform duration-300 ease-out group-focus-within/folder:-translate-y-1.5 group-hover/folder:-translate-y-1.5 motion-reduce:transition-none motion-reduce:group-focus-within/folder:translate-y-0 motion-reduce:group-hover/folder:translate-y-0" />
    </div>
  );
}

/**
 * A Project as a folder on the Projects home (ADR CM-0026 §3): its colour,
 * name (with the pin), Project Type, logo, status, address, dates and
 * progress. The whole front is the link to the Project; `menu` (the kebab)
 * sits over its top-right corner, outside the link.
 */
export function ProjectFolderCard({
  project,
  href,
  menu,
}: {
  project: ProjectItem;
  href: string;
  menu?: (chipClassName: string) => ReactNode;
}) {
  const tint = PROJECT_FOLDER_TINTS[project.color];
  const dates = projectDates(project);
  return (
    <li data-color={project.color} className="group/folder relative pt-7">
      <FolderBack back={tint.back} />
      <Link
        href={href}
        className={cn(
          "bg-card focus-visible:ring-ring/50 relative flex h-full min-h-44 flex-col gap-3 rounded-2xl border p-4 pr-14 shadow-xs outline-none focus-visible:ring-3",
          tint.body,
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <ProjectAvatar
            name={project.name}
            logoUrl={project.logoUrl}
            className="size-9 shadow-xs"
          />
          <div className="min-w-0 space-y-0.5">
            <p className="flex min-w-0 items-center gap-1.5 text-base leading-snug font-semibold tracking-tight">
              <span className="truncate">{project.name}</span>
              {project.pinned ? (
                <Pin
                  aria-label="Pinned"
                  role="img"
                  className="text-primary size-3.5 shrink-0"
                />
              ) : null}
            </p>
            <p className="text-foreground/70 truncate text-xs">
              {project.projectType == null
                ? "Project Type not set"
                : projectTypeLabel(project.projectType)}
            </p>
          </div>
        </div>
        <div>
          <ProjectStatusBadge status={project.status} />
        </div>
        <div className="mt-auto space-y-1.5 text-sm">
          {project.address == null ? null : (
            <p className="text-foreground/70 flex min-w-0 gap-1.5">
              <MapPin aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span className="truncate">{project.address}</span>
            </p>
          )}
          {dates == null ? null : (
            <p className="text-foreground/70 flex min-w-0 gap-1.5">
              <CalendarDays
                aria-hidden="true"
                className="mt-0.5 size-3.5 shrink-0"
              />
              <span className="truncate">{dates}</span>
            </p>
          )}
          {project.address == null && dates == null ? (
            <p className="text-foreground/70">No address or dates yet.</p>
          ) : null}
          <ProjectProgressBar
            progress={project.progress}
            trackClassName={tint.track}
            className="pt-1"
          />
        </div>
      </Link>
      {menu == null ? null : (
        <div className="absolute top-10 right-3">{menu(tint.chip)}</div>
      )}
    </li>
  );
}
