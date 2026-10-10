"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Pencil } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { buttonVariants } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { projectTypeLabel } from "@/src/projects/domain/project-type";
import { projectQuery } from "@/src/queries/projects";

import { ProjectAvatar } from "./project-avatar";
import { PROJECTS_PATH, projectPath } from "./projects-home";
import { ProjectStatusBadge, projectDates } from "./project-status";

/** The Project's sections; later tickets fill Attendance, Payments, Reports. */
export const PROJECT_TABS = [
  { segment: "", label: "Overview" },
  { segment: "documents", label: "Documents" },
  { segment: "attendance", label: "Attendance" },
  { segment: "payments", label: "Payments" },
  { segment: "reports", label: "Reports" },
] as const;

function activeSegment(pathname: string, base: string): string {
  const rest = pathname.startsWith(base) ? pathname.slice(base.length) : "";
  const segment = rest.split("/").find(Boolean) ?? "";
  // Edit belongs to Overview.
  return PROJECT_TABS.some((tab) => tab.segment === segment) ? segment : "";
}

/**
 * The project shell (CM-204): the logo when there is one (CM-401), name,
 * status, Project Type and Edit above tab links for the Project's
 * sections. Tabs scroll sideways on a phone.
 */
export function ProjectShell({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { data: project } = useSuspenseQuery(projectQuery(id));
  const pathname = usePathname();
  const base = projectPath(id);
  const current = activeSegment(pathname, base);
  const dates = projectDates(project);

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="w-full space-y-4 px-6 pt-6">
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
              </span>
            }
            actions={
              <Link
                href={`${base}/edit`}
                className={buttonVariants({ variant: "outline" })}
              >
                <Pencil aria-hidden="true" />
                Edit
              </Link>
            }
          />
        </div>
        <nav
          aria-label="Project sections"
          className="-mx-6 overflow-x-auto border-b px-6"
        >
          <ul className="flex w-max gap-1">
            {PROJECT_TABS.map((tab) => {
              const href = tab.segment === "" ? base : `${base}/${tab.segment}`;
              const active = tab.segment === current;
              return (
                <li key={tab.label}>
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
                    {tab.label}
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
