"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { cn } from "@repo/ui/lib/utils";

import { clientEditPath } from "@/components/masters/clients/client-form-schema";
import {
  clientPhoneLabel,
  orderValueLabel,
  PROJECT_PAPERS,
} from "@/components/projects/project-contract";
import { formatCalendarDate } from "@/components/projects/project-status";
import { projectRoleLabel } from "@/src/projects/domain/project-role";
import { projectQuery, type ProjectResponse } from "@/src/queries/projects";

type TileProps = {
  label: string;
  value: string;
  note?: string | null;
  wide?: boolean;
  /** Where the value links to, e.g. the Client's master record. */
  href?: string;
};

/** One filled-in value: a label, the value, maybe a date under it. */
function Tile({ label, value, note, wide = false, href }: TileProps) {
  return (
    <div
      className={cn(
        "bg-muted/40 min-w-0 rounded-lg px-3 py-2.5",
        wide && "sm:col-span-2",
      )}
    >
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words whitespace-pre-line">
        {href == null ? (
          value
        ) : (
          <Link href={href} className="hover:underline">
            {value}
          </Link>
        )}
      </dd>
      {note == null ? null : (
        <dd className="text-muted-foreground text-xs">{note}</dd>
      )}
    </div>
  );
}

function TileGroup({
  id,
  title,
  tiles,
}: {
  id: string;
  title: string;
  tiles: readonly TileProps[];
}) {
  if (tiles.length === 0) return null;
  return (
    // A group, not a region: the dashboard's regions are its sections.
    <div role="group" aria-labelledby={id} className="space-y-2">
      <h3 id={id} className="text-sm font-semibold">
        {title}
      </h3>
      <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((tile) => (
          <Tile key={tile.label} {...tile} />
        ))}
      </dl>
    </div>
  );
}

function siteTiles(project: ProjectResponse): TileProps[] {
  const tiles: TileProps[] = [];
  if (project.address != null)
    tiles.push({
      label: "Project address",
      value: project.address,
      wide: true,
    });
  if (project.stateName != null)
    tiles.push({ label: "State", value: project.stateName });
  return tiles;
}

/**
 * The Client, the papers and the Order value (CM-413). Order value is null
 * without the Financial flag, so it hides too.
 */
function contractTiles(project: ProjectResponse): TileProps[] {
  const tiles: TileProps[] = [];
  // Only Contract work says so: Own development is the default and has no
  // Client to bill (ADR CM-0023 §2).
  if (project.role === "contract")
    tiles.push({ label: "Role", value: projectRoleLabel(project.role) });
  if (project.clientName != null || project.clientPhone != null)
    tiles.push({
      label: "Client",
      // A linked Client opens its master record (CM-1101).
      ...(project.clientId == null
        ? {}
        : { href: clientEditPath(project.clientId) }),
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
  return tiles;
}

/**
 * The rest of the Project's details under its summary: the address and
 * State, the Contract and the Additional details, only what is filled in.
 * They read the Project the shell has already loaded.
 */
export function SummaryDetails({ projectId }: { projectId: string }) {
  const { data: project } = useQuery(projectQuery(projectId));
  if (project == null) return null;
  return (
    <>
      <TileGroup id="dashboard-site" title="Site" tiles={siteTiles(project)} />
      <TileGroup
        id="dashboard-contract"
        title="Contract"
        tiles={contractTiles(project)}
      />
      <TileGroup
        id="dashboard-more"
        title="Additional details"
        tiles={project.customFields.map((field) => ({
          label: field.label,
          value: field.value,
        }))}
      />
    </>
  );
}
