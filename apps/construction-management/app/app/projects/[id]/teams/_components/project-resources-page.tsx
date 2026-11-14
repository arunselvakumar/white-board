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

import { projectPath } from "@/app/app/projects/_components/projects-home";
import {
  projectResourcesQuery,
  type ProjectResources,
  type ResourceSection,
} from "@/src/queries/project-resources";

import { LaboursSection } from "./labours-section";
import { ResourcePickerDialog } from "./resource-picker-dialog";
import {
  RESOURCE_SECTIONS,
  type ResourceSectionInfo,
} from "./resource-sections";
import { SiteEngineersSection } from "./site-engineers-section";
import { TeamRow } from "./team-row";

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
      <AlertTitle>Step 2 of 2 · Teams</AlertTitle>
      <AlertDescription>
        Choose the Site Engineers, Labours, Team Members, Contractors, Suppliers
        and Vendors on this Project. You can change them any time from Teams.
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
  href,
}: {
  line: Line | ProjectResources["contractors"][number];
  href: string | null;
}) {
  const owner = "isOwner" in line && line.isOwner;
  return (
    <TeamRow
      name={line.name}
      // The Owner has no Office Staff page (ADR CM-0044 §1).
      href={owner ? null : href}
      detail={line.detail}
      badges={
        <>
          {owner && <Badge variant="secondary">Owner</Badge>}
          {!line.isActive && <Badge variant="outline">Inactive</Badge>}
        </>
      }
    />
  );
}

function ResourceCard({
  projectId,
  section,
  lines,
  canEdit,
  canOpen,
}: {
  projectId: string;
  section: ResourceSectionInfo;
  lines: readonly (Line | ProjectResources["contractors"][number])[];
  canEdit: boolean;
  /** The viewer may read the menu the section's pages belong to. */
  canOpen: boolean;
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
        <Empty className="bg-card border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Icon />
            </EmptyMedia>
            <EmptyTitle>No {section.title} on this Project</EmptyTitle>
            <EmptyDescription>
              {canEdit
                ? `Choose them with Edit, or add a new ${section.singular} in ${section.area}.`
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
        <ul
          aria-label={section.title}
          className="bg-card divide-y overflow-hidden rounded-lg border"
        >
          {lines.map((line) => (
            <ResourceLine
              key={line.id}
              line={line}
              href={canOpen ? section.pagePath(line.id) : null}
            />
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

/** What the viewer may do beyond reading, from the Permission Matrix. */
export type ResourcesAccess = {
  /** Project menu Update: change every section. */
  canEdit: boolean;
  /** Labours Read: the Add Labours picker, Labour and Site Engineer pages. */
  canReadLabours?: boolean;
  /**
   * Read on the menu of each section's pages (Team Members, Contractors,
   * Suppliers, Vendors): their rows open those pages.
   */
  canOpenSections?: Partial<Record<ResourceSection, boolean>>;
  /** Labour Transfer on this Project. */
  canTransfer?: boolean;
};

/**
 * A Project's Resources: who works on it. Site Engineers and Labours come
 * first (ADR CM-0038), then four sections each edited in its own dialog
 * and saved on its own. Opened with `?step=resources` right after Add
 * Project, as the wizard's second step; the Project is saved by then, so
 * every section works there too.
 */
export function ProjectResourcesPage({
  projectId,
  canEdit,
  canReadLabours = false,
  canOpenSections = {},
  canTransfer = false,
  wizard = false,
}: ResourcesAccess & {
  projectId: string;
  /** Add Project's step 2 of 2: a banner with Skip / Done. */
  wizard?: boolean;
}) {
  const { data } = useSuspenseQuery(projectResourcesQuery(projectId));
  const assignedAny =
    data.siteEngineers.length > 0 ||
    data.labours.total > 0 ||
    data.teamMembers.some((line) => !line.isOwner) ||
    data.contractors.length > 0 ||
    data.suppliers.length > 0 ||
    data.vendors.length > 0;
  return (
    <div className="w-full max-w-5xl space-y-6 p-6">
      {wizard && <StepBanner projectId={projectId} assignedAny={assignedAny} />}
      <div className="grid w-full gap-6 lg:grid-cols-2">
        <SiteEngineersSection
          projectId={projectId}
          engineers={data.siteEngineers}
          canEdit={canEdit}
          canOpenPages={canReadLabours}
        />
        <LaboursSection
          projectId={projectId}
          total={data.labours.total}
          today={data.today}
          canEdit={canEdit}
          canPickLabours={canReadLabours}
          canOpenLabours={canReadLabours}
          canTransfer={canTransfer}
        />
        {RESOURCE_SECTIONS.map((section) => (
          <ResourceCard
            key={section.key}
            projectId={projectId}
            section={section}
            lines={data[section.key]}
            canEdit={canEdit}
            canOpen={canOpenSections[section.key] ?? false}
          />
        ))}
      </div>
    </div>
  );
}
