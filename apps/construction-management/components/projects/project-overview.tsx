"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { cn } from "@repo/ui/lib/utils";

import { projectQuery } from "@/src/queries/projects";

import { EditProjectForm } from "./project-form";
import { ProjectLabourTiles } from "./project-labour-tiles";
import { ProjectStatusBadge, formatCalendarDate } from "./project-status";

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function Detail({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <dt className="text-muted-foreground text-sm">{label}</dt>
      <dd className="text-sm font-medium break-words">{children}</dd>
    </div>
  );
}

/** Overview tab: labour today (CM-219) and the Project's details. */
export function ProjectOverview({ id }: { id: string }) {
  const { data: project } = useSuspenseQuery(projectQuery(id));
  const none = <span className="text-muted-foreground font-normal">—</span>;
  return (
    <div className="w-full max-w-5xl space-y-6 p-6">
      <ProjectLabourTiles projectId={id} />
      <section
        aria-labelledby="project-details"
        className="bg-card w-full max-w-4xl space-y-4 rounded-xl border p-4 sm:p-6"
      >
        <h2 id="project-details" className="font-semibold">
          Details
        </h2>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Detail label="Status">
            <ProjectStatusBadge status={project.status} />
          </Detail>
          <Detail label="Added on">
            {DATE_TIME.format(new Date(project.createdAt))}
          </Detail>
          <Detail label="Start date">
            {project.startDate == null
              ? none
              : formatCalendarDate(project.startDate)}
          </Detail>
          <Detail label="Expected completion">
            {project.endDate == null
              ? none
              : formatCalendarDate(project.endDate)}
          </Detail>
          <Detail label="Project address" className="sm:col-span-2">
            {project.address == null ? (
              none
            ) : (
              <span className="whitespace-pre-line">{project.address}</span>
            )}
          </Detail>
        </dl>
      </section>
    </div>
  );
}

/** `/app/projects/[id]/edit`, inside the project shell. */
export function ProjectEditScreen({ id }: { id: string }) {
  const { data: project } = useSuspenseQuery(projectQuery(id));
  return <EditProjectForm key={project.updatedAt} project={project} />;
}
