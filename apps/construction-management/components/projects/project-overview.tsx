"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { TriangleAlert, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, AlertAction, AlertTitle } from "@repo/ui/components/alert";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { projectTypeLabel } from "@/src/projects/domain/project-type";
import {
  projectQuery,
  projectsQuery,
  type ProjectResponse,
} from "@/src/queries/projects";

import {
  clientPhoneLabel,
  orderValueLabel,
  PROJECT_PAPERS,
} from "./project-contract";
import { clearProjectFlash, peekProjectFlash } from "./project-flash";
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

/** One filled-in contract value: a label, the value, maybe a date under it. */
function Tile({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string | null;
}) {
  return (
    <div className="bg-muted/40 min-w-0 rounded-lg px-3 py-2.5">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{value}</dd>
      {note == null ? null : (
        <dd className="text-muted-foreground text-xs">{note}</dd>
      )}
    </div>
  );
}

/**
 * The Client, the papers and the Order value (CM-413), only what is filled
 * in; nothing at all hides the card. Order value is null without the
 * Financial flag, so it hides too.
 */
function ContractCard({ project }: { project: ProjectResponse }) {
  const tiles: { label: string; value: string; note?: string | null }[] = [];
  if (project.clientName != null || project.clientPhone != null)
    tiles.push({
      label: "Client",
      value: project.clientName ?? clientPhoneLabel(project.clientPhone ?? ""),
      note:
        project.clientName != null && project.clientPhone != null
          ? clientPhoneLabel(project.clientPhone)
          : null,
    });
  if (project.orderValue != null)
    tiles.push({
      label: "Order value",
      value: `${orderValueLabel(project.orderValue)} excl. GST`,
    });
  for (const paper of PROJECT_PAPERS) {
    const number = project[paper.numberField];
    const date = paper.dateField == null ? null : project[paper.dateField];
    if (number == null && date == null) continue;
    tiles.push({
      label: paper.label,
      value: number ?? formatCalendarDate(date ?? ""),
      note: number != null && date != null ? formatCalendarDate(date) : null,
    });
  }
  if (tiles.length === 0) return null;
  return (
    <section
      aria-labelledby="project-contract"
      className="bg-card w-full max-w-4xl space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <h2 id="project-contract" className="font-semibold">
        Contract
      </h2>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </dl>
    </section>
  );
}

function AdditionalDetailsCard({ project }: { project: ProjectResponse }) {
  if (project.customFields.length === 0) return null;
  return (
    <section
      aria-labelledby="project-more"
      className="bg-card w-full max-w-4xl space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <h2 id="project-more" className="font-semibold">
        Additional details
      </h2>
      <dl className="grid gap-4 sm:grid-cols-2">
        {project.customFields.map((field) => (
          <Detail key={field.label} label={field.label}>
            <span className="whitespace-pre-line">{field.value}</span>
          </Detail>
        ))}
      </dl>
    </section>
  );
}

/** A message left by the screen before, e.g. files that failed to upload. */
function ProjectFlash({ id }: { id: string }) {
  const [message, setMessage] = useState(() => peekProjectFlash(id));
  useEffect(() => {
    clearProjectFlash(id);
  }, [id]);
  if (message == null) return null;
  return (
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
  );
}

/** Overview tab: labour today (CM-219) and the Project's details. */
export function ProjectOverview({ id }: { id: string }) {
  const { data: project } = useSuspenseQuery(projectQuery(id));
  const none = <span className="text-muted-foreground font-normal">—</span>;
  return (
    <div className="w-full max-w-5xl space-y-6 p-6">
      <ProjectFlash id={id} />
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
          <Detail label="Project Type">
            {project.projectType == null ? (
              <span className="text-muted-foreground font-normal">Not set</span>
            ) : (
              projectTypeLabel(project.projectType)
            )}
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
          {/* Null without the Financial flag, so it hides too. */}
          {project.budgetValue == null ? null : (
            <Detail label="Budget">
              {orderValueLabel(project.budgetValue)}
            </Detail>
          )}
          <Detail label="Project address" className="sm:col-span-2">
            {project.address == null ? (
              none
            ) : (
              <span className="whitespace-pre-line">{project.address}</span>
            )}
          </Detail>
        </dl>
      </section>
      <ContractCard project={project} />
      <AdditionalDetailsCard project={project} />
    </div>
  );
}

/**
 * `/app/projects/[id]/edit`, inside the project shell. The Projects list
 * says whether the viewer has the Financial flag.
 */
export function ProjectEditScreen({ id }: { id: string }) {
  const { data: project } = useSuspenseQuery(projectQuery(id));
  const { data: list } = useSuspenseQuery(projectsQuery);
  return (
    <EditProjectForm
      key={project.updatedAt}
      project={project}
      financial={list.financial}
    />
  );
}
