"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ListChecks, Pencil } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@repo/ui/components/alert";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { projectPath } from "@/components/projects/projects-home";
import {
  projectResourcesQuery,
  type ProjectResources,
} from "@/src/queries/project-resources";

import { ResourcePickerDialog } from "./resource-picker-dialog";
import {
  RESOURCE_SECTIONS,
  type ResourceSectionInfo,
} from "./resource-sections";

type Line = ProjectResources["teamMembers"][number];

function StepBanner({
  projectId,
  assignedAny,
}: {
  projectId: string;
  assignedAny: boolean;
}) {
  return (
    <Alert>
      <ListChecks aria-hidden="true" />
      <AlertTitle>Step 2 of 2 · Assign resources</AlertTitle>
      <AlertDescription>
        Choose the Team Members, Contractors, Suppliers and Vendors on this
        Project. You can change them any time from Resources.
      </AlertDescription>
      <AlertAction className="static col-span-full mt-2 sm:absolute sm:top-2.5 sm:right-3 sm:mt-0">
        <Link
          href={projectPath(projectId)}
          className={buttonVariants({
            variant: assignedAny ? "default" : "outline",
            size: "sm",
          })}
        >
          {assignedAny ? "Done" : "Skip"}
        </Link>
      </AlertAction>
    </Alert>
  );
}

function ResourceLine({
  line,
}: {
  line: Line | ProjectResources["contractors"][number];
}) {
  const owner = "isOwner" in line && line.isOwner;
  return (
    <li className="flex min-w-0 items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{line.name}</span>
        {line.detail != null && (
          <span className="text-muted-foreground block truncate text-xs">
            {line.detail}
          </span>
        )}
      </span>
      {owner && <Badge variant="secondary">Owner</Badge>}
      {!line.isActive && <Badge variant="outline">Inactive</Badge>}
    </li>
  );
}

function ResourceCard({
  projectId,
  section,
  lines,
  canEdit,
}: {
  projectId: string;
  section: ResourceSectionInfo;
  lines: readonly (Line | ProjectResources["contractors"][number])[];
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const assigned = lines.filter((line) => !("isOwner" in line && line.isOwner));
  const headingId = `resources-${section.key}`;
  const Icon = section.icon;
  return (
    <section
      aria-labelledby={headingId}
      className="bg-card w-full space-y-4 rounded-xl border p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={headingId} className="font-semibold">
            {section.title}{" "}
            {/* Everyone listed, the Owner included: a heading that says 0
                above the Owner's row reads wrong. */}
            <span className="text-muted-foreground font-normal">
              {lines.length}
            </span>
          </h2>
          <p className="text-muted-foreground text-sm">{section.description}</p>
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-label={`Edit ${section.title}`}
            onClick={() => {
              setEditing(true);
            }}
          >
            <Pencil aria-hidden="true" />
            Edit
          </Button>
        )}
      </div>
      {lines.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>No {section.title} on this Project</EmptyTitle>
            <EmptyDescription>
              {canEdit
                ? `Choose them with Edit, or add a new ${section.singular} in Masters.`
                : `Nobody has put ${section.title} on this Project yet.`}
            </EmptyDescription>
          </EmptyHeader>
          {canEdit && (
            <EmptyContent>
              <Link
                href={section.addPath}
                className={buttonVariants({ variant: "outline" })}
              >
                Add a {section.singular}
              </Link>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <ul aria-label={section.title} className="divide-y rounded-lg border">
          {lines.map((line) => (
            <ResourceLine key={line.id} line={line} />
          ))}
        </ul>
      )}
      {canEdit && (
        <ResourcePickerDialog
          projectId={projectId}
          section={section}
          assigned={assigned}
          open={editing}
          onOpenChange={setEditing}
        />
      )}
    </section>
  );
}

/**
 * A Project's Resources (CM-406): who works on it, in four sections, each
 * edited in its own dialog and saved on its own. Opened with
 * `?step=resources` right after Add Project, as the wizard's second step.
 */
export function ProjectResourcesPage({
  projectId,
  canEdit,
  wizard = false,
}: {
  projectId: string;
  canEdit: boolean;
  /** Add Project's step 2 of 2: a banner with Skip / Done. */
  wizard?: boolean;
}) {
  const { data } = useSuspenseQuery(projectResourcesQuery(projectId));
  const assignedAny =
    data.teamMembers.some((line) => !line.isOwner) ||
    data.contractors.length > 0 ||
    data.suppliers.length > 0 ||
    data.vendors.length > 0;
  return (
    <div className="w-full max-w-5xl space-y-6 p-6">
      {wizard && <StepBanner projectId={projectId} assignedAny={assignedAny} />}
      <div className="grid w-full gap-6 lg:grid-cols-2">
        {RESOURCE_SECTIONS.map((section) => (
          <ResourceCard
            key={section.key}
            projectId={projectId}
            section={section}
            lines={data[section.key]}
            canEdit={canEdit}
          />
        ))}
      </div>
    </div>
  );
}
