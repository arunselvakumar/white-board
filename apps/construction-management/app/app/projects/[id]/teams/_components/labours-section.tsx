"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search, UsersRound } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useState, useTransition } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";

import { TransferDialog } from "@/app/app/staff/labours/_components/transfer-dialog";
import {
  PROJECT_LABOURS_PAGE_SIZE,
  projectLaboursQuery,
  useReloadProjectResources,
  type ProjectLabour,
} from "@/src/queries/project-resources";
import { projectQuery } from "@/src/queries/projects";

import { AddLaboursDialog } from "./add-labours-dialog";
import { labourDetail, labourPath, sinceLabel } from "./labour-lines";
import { RemoveLabourDialog } from "./remove-labour-dialog";

type Position = { after?: string; before?: string; page: number };

const FIRST: Position = { page: 0 };

function LabourRow({
  labour,
  canEdit,
  canOpenLabours,
  canTransfer,
  onRemove,
  onTransfer,
}: {
  labour: ProjectLabour;
  canEdit: boolean;
  canOpenLabours: boolean;
  canTransfer: boolean;
  onRemove: () => void;
  onTransfer: () => void;
}) {
  const detail = labourDetail(labour);
  return (
    <li className="flex min-w-0 items-center gap-3 px-4 py-3">
      <span className="min-w-0 flex-1">
        {canOpenLabours ? (
          <Link
            href={labourPath(labour.id)}
            className="block truncate text-sm font-medium hover:underline"
          >
            {labour.name}
          </Link>
        ) : (
          <span className="block truncate text-sm font-medium">
            {labour.name}
          </span>
        )}
        <span className="text-muted-foreground block truncate text-xs">
          {[detail, sinceLabel(labour.since)].filter(Boolean).join(" · ")}
        </span>
      </span>
      {!labour.isActive && <Badge variant="outline">Inactive</Badge>}
      {(canEdit || canTransfer) && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Actions for ${labour.name}`}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            {canTransfer && (
              <DropdownMenuItem onClick={onTransfer}>
                Transfer to another Project
              </DropdownMenuItem>
            )}
            {canEdit && (
              <DropdownMenuItem variant="destructive" onClick={onRemove}>
                Remove from Project
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </li>
  );
}

/**
 * The Labours on a Project (ADR CM-0038 §2), by name, 50 a page: search
 * by name, Labour Id or phone, page with Previous and Next. Add Labours
 * picks many at once from a date; a row's menu removes one after a Last
 * day or opens the Transfer dialog. Every change writes the same history
 * as Edit Labour.
 */
export function LaboursSection({
  projectId,
  total,
  today,
  canEdit,
  canPickLabours,
  canOpenLabours,
  canTransfer,
}: {
  projectId: string;
  /** Every Labour on the Project, whatever the search. */
  total: number;
  /** The Company's today, the dialogs' default date. */
  today: string;
  canEdit: boolean;
  /** The Add Labours picker reads the register: Labours Read. */
  canPickLabours: boolean;
  /** The Labour page needs Labours Read. */
  canOpenLabours: boolean;
  /** Labour Transfer on this Project. */
  canTransfer: boolean;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [position, setPosition] = useState<Position>(FIRST);
  const [isPaging, startPaging] = useTransition();
  const { data } = useSuspenseQuery(
    projectLaboursQuery(projectId, {
      search: deferredSearch,
      ...(position.after == null ? {} : { after: position.after }),
      ...(position.before == null ? {} : { before: position.before }),
    }),
  );
  const project = useQuery({
    ...projectQuery(projectId),
    enabled: canTransfer,
  });
  const reload = useReloadProjectResources(projectId);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<ProjectLabour | null>(null);
  const [transferring, setTransferring] = useState<ProjectLabour | null>(null);
  const headingId = "resources-labours";
  const searching = deferredSearch.trim() !== "";
  const first = position.page * PROJECT_LABOURS_PAGE_SIZE + 1;
  const last = first + data.items.length - 1;
  const stale = search !== deferredSearch || isPaging;

  return (
    <section
      aria-labelledby={headingId}
      className="bg-card w-full min-w-0 space-y-4 rounded-xl border p-4 sm:p-6 lg:col-span-2"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h2 id={headingId} className="font-semibold">
            Labours{" "}
            <span className="text-muted-foreground font-normal">{total}</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Labours on a Project appear on its attendance sheet from their first
            day.
          </p>
        </div>
        {canEdit && canPickLabours && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus aria-hidden="true" />
            Add Labours
          </Button>
        )}
      </div>
      {total > 0 && (
        <InputGroup className="sm:max-w-sm">
          <InputGroupAddon>
            <Search aria-hidden="true" />
          </InputGroupAddon>
          <InputGroupInput
            type="search"
            aria-label="Search Labours on this Project"
            placeholder="Search name, Labour Id or phone"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              // A new search starts on its first page, keeping this one
              // on screen until it loads.
              startPaging(() => {
                setPosition(FIRST);
              });
            }}
          />
        </InputGroup>
      )}
      {data.items.length === 0 ? (
        <Empty className="bg-card border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UsersRound />
            </EmptyMedia>
            <EmptyTitle>
              {searching
                ? `No Labours match “${deferredSearch.trim()}”`
                : "No Labours on this Project"}
            </EmptyTitle>
            <EmptyDescription>
              {searching
                ? "Search by name, Labour Id or phone."
                : canEdit && canPickLabours
                  ? "Add the Labours who work here, from the day they start."
                  : "Nobody has put Labours on this Project yet."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul
          aria-label="Labours"
          aria-busy={stale}
          className={`bg-card divide-y rounded-lg border transition-opacity ${stale ? "opacity-60" : ""}`}
        >
          {data.items.map((labour) => (
            <LabourRow
              key={labour.id}
              labour={labour}
              canEdit={canEdit}
              canOpenLabours={canOpenLabours}
              canTransfer={canTransfer}
              onRemove={() => {
                setRemoving(labour);
              }}
              onTransfer={() => {
                setTransferring(labour);
              }}
            />
          ))}
        </ul>
      )}
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm" aria-live="polite">
            {first}–{last} of {data.total}
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={data.prevCursor == null || isPaging}
              onClick={() => {
                const before = data.prevCursor;
                if (before == null) return;
                startPaging(() => {
                  setPosition({
                    before,
                    page: Math.max(0, position.page - 1),
                  });
                });
              }}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={data.nextCursor == null || isPaging}
              onClick={() => {
                const after = data.nextCursor;
                if (after == null) return;
                startPaging(() => {
                  setPosition({ after, page: position.page + 1 });
                });
              }}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {canEdit && canPickLabours && (
        <AddLaboursDialog
          projectId={projectId}
          today={today}
          open={adding}
          onOpenChange={setAdding}
        />
      )}
      {canEdit && (
        <RemoveLabourDialog
          projectId={projectId}
          labour={removing}
          today={today}
          onClose={() => {
            setRemoving(null);
          }}
        />
      )}
      {canTransfer && (
        <TransferDialog
          labours={
            transferring == null
              ? []
              : [
                  {
                    id: transferring.id,
                    name: transferring.name,
                    projects: [
                      {
                        id: projectId,
                        name: project.data?.name ?? "this Project",
                      },
                    ],
                  },
                ]
          }
          fromProjectId={projectId}
          open={transferring != null}
          onOpenChange={(open) => {
            if (!open) setTransferring(null);
          }}
          onTransferred={() => {
            void reload();
          }}
        />
      )}
    </section>
  );
}
