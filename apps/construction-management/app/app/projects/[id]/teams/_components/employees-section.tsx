"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { MoreHorizontal, Plus, Search } from "lucide-react";
import { MagnifyingGlassIcon, UsersThreeIcon } from "@phosphor-icons/react/ssr";
import { useDeferredValue, useState, useTransition } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import { EmptyState } from "@repo/ui/components/empty-state";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@repo/ui/components/input-group";

import { TransferDialog } from "@/app/app/staff/employees/_components/transfer-dialog";
import {
  PROJECT_EMPLOYEES_PAGE_SIZE,
  projectEmployeesQuery,
  useReloadProjectResources,
  type ProjectEmployee,
} from "@/src/queries/project-resources";
import { projectQuery } from "@/src/queries/projects";

import { AddEmployeesDialog } from "./add-employees-dialog";
import { employeeDetail, sinceLabel } from "./employee-lines";
import { RemoveEmployeeDialog } from "./remove-employee-dialog";
import { TeamRow } from "./team-row";
import { employeePagePath } from "@/lib/staff-nav";

type Position = { after?: string; before?: string; page: number };

const FIRST: Position = { page: 0 };

function EmployeeRow({
  employee,
  canEdit,
  canOpenEmployees,
  canTransfer,
  onRemove,
  onTransfer,
}: {
  employee: ProjectEmployee;
  canEdit: boolean;
  canOpenEmployees: boolean;
  canTransfer: boolean;
  onRemove: () => void;
  onTransfer: () => void;
}) {
  return (
    <TeamRow
      name={employee.name}
      href={canOpenEmployees ? employeePagePath(employee.id) : null}
      detail={[employeeDetail(employee), sinceLabel(employee.since)]
        .filter(Boolean)
        .join(" · ")}
      badges={!employee.isActive && <Badge variant="outline">Inactive</Badge>}
      actions={
        (canEdit || canTransfer) && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Actions for ${employee.name}`}
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
        )
      }
    />
  );
}

/**
 * The Employees on a Project (ADR CM-0038 §2, CM-0055 §5), by name, 50 a
 * page, each with their Role: search by name, Employee Id or mobile, page
 * with Previous and Next. Add Employees picks many at once from a date; a
 * row's menu removes one after a Last day or opens the Transfer dialog.
 * Every change writes the same history as Edit Employee.
 */
export function EmployeesSection({
  projectId,
  total,
  today,
  canEdit,
  canPickEmployees,
  canOpenEmployees,
  canTransfer,
}: {
  projectId: string;
  /** Every Employee on the Project, whatever the search. */
  total: number;
  /** The Company's today, the dialogs' default date. */
  today: string;
  canEdit: boolean;
  /** The Add Employees picker reads the register: Employees Read. */
  canPickEmployees: boolean;
  /** The Employee page needs Employees Read. */
  canOpenEmployees: boolean;
  /** Transfer on the Project's Employees (`employee.employee`). */
  canTransfer: boolean;
}) {
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [position, setPosition] = useState<Position>(FIRST);
  const [isPaging, startPaging] = useTransition();
  const { data } = useSuspenseQuery(
    projectEmployeesQuery(projectId, {
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
  const [removing, setRemoving] = useState<ProjectEmployee | null>(null);
  const [transferring, setTransferring] = useState<ProjectEmployee | null>(
    null,
  );
  const headingId = "resources-employees";
  const searching = deferredSearch.trim() !== "";
  const first = position.page * PROJECT_EMPLOYEES_PAGE_SIZE + 1;
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
            Employees{" "}
            <span className="text-muted-foreground font-normal">{total}</span>
          </h2>
          <p className="text-muted-foreground text-sm">
            Employees on a Project appear on its attendance sheet from their
            first day, whatever their Role.
          </p>
        </div>
        {canEdit && canPickEmployees && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              setAdding(true);
            }}
          >
            <Plus aria-hidden="true" />
            Add Employees
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
            aria-label="Search Employees on this Project"
            placeholder="Search name, Employee Id or mobile"
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
        <EmptyState
          className="bg-card border"
          icon={searching ? MagnifyingGlassIcon : UsersThreeIcon}
          size="md"
          tone={searching ? "neutral" : "violet"}
          title={
            searching
              ? `No Employees match “${deferredSearch.trim()}”`
              : "No Employees on this Project"
          }
          description={
            searching
              ? "Search by name, Employee Id or mobile."
              : canEdit && canPickEmployees
                ? "Add the Employees who work here, from the day they start."
                : "Nobody has put Employees on this Project yet."
          }
        />
      ) : (
        <ul
          aria-label="Employees"
          aria-busy={stale}
          className={`bg-card divide-y overflow-hidden rounded-lg border transition-opacity ${stale ? "opacity-60" : ""}`}
        >
          {data.items.map((employee) => (
            <EmployeeRow
              key={employee.id}
              employee={employee}
              canEdit={canEdit}
              canOpenEmployees={canOpenEmployees}
              canTransfer={canTransfer}
              onRemove={() => {
                setRemoving(employee);
              }}
              onTransfer={() => {
                setTransferring(employee);
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
      {canEdit && canPickEmployees && (
        <AddEmployeesDialog
          projectId={projectId}
          today={today}
          open={adding}
          onOpenChange={setAdding}
        />
      )}
      {canEdit && (
        <RemoveEmployeeDialog
          projectId={projectId}
          employee={removing}
          today={today}
          onClose={() => {
            setRemoving(null);
          }}
        />
      )}
      {canTransfer && (
        <TransferDialog
          employees={
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
