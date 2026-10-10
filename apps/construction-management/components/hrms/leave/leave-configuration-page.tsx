"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Layers, MoreHorizontal, Plus, UserPlus } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";

import { FormAlert } from "@/components/auth/form-alert";
import {
  ConfirmDeleteDialog,
  MasterEmpty,
} from "@/components/masters/master-list-parts";
import { fieldForCode } from "@/lib/server-errors";
import {
  leaveAssignmentsQuery,
  leaveOptionsQuery,
  leaveStructuresQuery,
  leaveTypesQuery,
  useLeaveCommand,
  type LeaveStructureModel,
  type LeaveTypeModel,
} from "@/src/queries/hrms-leave";

import { LeaveAssignDialog } from "./leave-assign-dialog";
import { formatDate, formatDays, localToday } from "./leave-format";
import { LeaveStructureDialog } from "./leave-structure-dialog";
import { LeaveTypeDialog } from "./leave-type-dialog";

function errorMessage(error: unknown): string {
  return fieldForCode(error, {}).message;
}

function creditLabel(type: LeaveTypeModel): string {
  if (type.accrualMode === "periodic" && type.creditPerPeriod != null)
    return `${formatDays(type.creditPerPeriod)} a month`;
  if (type.accrualMode === "upfront") return "Upfront";
  return "No credit";
}

function RowMenu({
  label,
  busy,
  children,
}: {
  label: string;
  busy: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={busy}
            aria-label={label}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Configuration → Leave Types & Structures (CM-310, CM-311): the
 * Company's leave types (six seeds plus its own), the structures that
 * bundle them with entitlements, and who is on which structure from when.
 */
export function LeaveConfigurationPage({ today }: { today?: string }) {
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <div className="space-y-1">
          <h2 className="text-xl font-semibold tracking-tight">
            Leave Types &amp; Structures
          </h2>
          <p className="text-muted-foreground text-sm">
            The kinds of leave your Company gives, how they are credited, and
            the bundles Team Members get.
          </p>
        </div>
        <Tabs defaultValue="types" className="gap-4">
          <TabsList>
            <TabsTrigger value="types">Leave types</TabsTrigger>
            <TabsTrigger value="structures">Structures</TabsTrigger>
          </TabsList>
          <TabsContent value="types">
            <LeaveTypesTab />
          </TabsContent>
          <TabsContent value="structures">
            <StructuresTab today={today ?? localToday()} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function LeaveTypesTab() {
  const { data } = useSuspenseQuery(leaveTypesQuery);
  const command = useLeaveCommand();
  const [editing, setEditing] = useState<LeaveTypeModel | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LeaveTypeModel | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add leave type
    </Button>
  );

  return (
    <div className="space-y-3">
      {data.items.length === 0 ? (
        <MasterEmpty
          icon={Layers}
          title="No leave types yet"
          description="Add the kinds of leave your Company gives, like Casual Leave or Sick."
          action={addButton}
        />
      ) : (
        <>
          <div className="flex justify-end">{addButton}</div>
          <FormAlert message={listError} />
          <ul
            aria-label="Leave types"
            className="bg-card divide-y rounded-xl border"
          >
            {data.items.map((type) => (
              <li key={type.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1 space-y-1">
                  <p
                    className={
                      type.isActive
                        ? "truncate font-medium"
                        : "text-muted-foreground truncate font-medium"
                    }
                  >
                    {type.name}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {type.yearlyLimit > 0
                      ? `${formatDays(type.yearlyLimit)} a year`
                      : type.isPaid
                        ? "Credited by adjustment"
                        : "No limit"}
                    {" · "}
                    {creditLabel(type)}
                    {type.carryForward && type.maxCarryForward != null
                      ? ` · Carry forward up to ${formatDays(type.maxCarryForward)}`
                      : ""}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant={type.isPaid ? "secondary" : "outline"}>
                      {type.isPaid ? "Paid" : "Unpaid"}
                    </Badge>
                    {!type.requiresApproval ? (
                      <Badge variant="outline">No approval</Badge>
                    ) : null}
                    {type.isSeed ? (
                      <Badge variant="secondary">Default</Badge>
                    ) : null}
                    {!type.isActive ? (
                      <Badge variant="outline">Inactive</Badge>
                    ) : null}
                  </div>
                </div>
                <RowMenu
                  label={`Actions for ${type.name}`}
                  busy={
                    command.isPending &&
                    "id" in command.variables &&
                    command.variables.id === type.id
                  }
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(type);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setListError(undefined);
                      command.mutate(
                        {
                          kind: type.isActive
                            ? "deactivate-type"
                            : "activate-type",
                          id: type.id,
                          expectedUpdatedAt: type.updatedAt,
                        },
                        {
                          onError: (error) => {
                            setListError(errorMessage(error));
                          },
                        },
                      );
                    }}
                  >
                    {type.isActive ? "Deactivate" : "Activate"}
                  </DropdownMenuItem>
                  {!type.inUse ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => {
                          setDeleteError(undefined);
                          setPendingDelete(type);
                        }}
                      >
                        Delete
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </RowMenu>
              </li>
            ))}
          </ul>
        </>
      )}
      <LeaveTypeDialog
        open={editing != null}
        type={editing === "new" ? null : editing}
        onClose={() => {
          setEditing(null);
        }}
      />
      <ConfirmDeleteDialog
        name={pendingDelete?.name ?? null}
        description="A leave type nobody has used can be deleted. One in a structure, a balance or a request can only be deactivated."
        error={deleteError}
        pending={command.isPending}
        onClose={() => {
          setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete == null) return;
          command.mutate(
            {
              kind: "delete-type",
              id: pendingDelete.id,
              expectedUpdatedAt: pendingDelete.updatedAt,
            },
            {
              onSuccess: () => {
                setPendingDelete(null);
              },
              onError: (error) => {
                setDeleteError(errorMessage(error));
              },
            },
          );
        }}
      />
    </div>
  );
}

function StructuresTab({ today }: { today: string }) {
  const { data: structures } = useSuspenseQuery(leaveStructuresQuery);
  const { data: types } = useSuspenseQuery(leaveTypesQuery);
  const { data: assignments } = useSuspenseQuery(leaveAssignmentsQuery);
  const { data: options } = useSuspenseQuery(leaveOptionsQuery);
  const command = useLeaveCommand();
  const [editing, setEditing] = useState<LeaveStructureModel | "new" | null>(
    null,
  );
  const [assigning, setAssigning] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] =
    useState<LeaveStructureModel | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const editingStructure = editing === "new" ? null : editing;
  const offered = types.items.filter(
    (type) =>
      type.isActive ||
      editingStructure?.lines.some((line) => line.leaveTypeId === type.id) ===
        true,
  );

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add structure
    </Button>
  );

  return (
    <div className="space-y-6">
      {structures.items.length === 0 ? (
        <MasterEmpty
          icon={Layers}
          title="No leave structures yet"
          description="A structure bundles leave types with the days Team Members get, like “Office staff” or “Site staff”. Without one, everyone gets every active type at its yearly limit."
          action={addButton}
        />
      ) : (
        <section
          aria-labelledby="leave-structures-heading"
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 id="leave-structures-heading" className="text-lg font-semibold">
              Structures
            </h3>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setAssigning("any");
                }}
              >
                <UserPlus aria-hidden="true" />
                Assign structure
              </Button>
              {addButton}
            </div>
          </div>
          <FormAlert message={listError} />
          <ul
            aria-label="Structures"
            className="bg-card divide-y rounded-xl border"
          >
            {structures.items.map((structure) => (
              <li
                key={structure.id}
                className="flex items-start gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="truncate font-medium">{structure.name}</p>
                  <p className="text-muted-foreground text-sm">
                    {structure.lines
                      .map(
                        (line) =>
                          `${line.leaveTypeName} ${formatDays(line.effectiveDays)}`,
                      )
                      .join(" · ")}
                  </p>
                  <Badge variant="secondary">
                    {structure.assignmentCount === 1
                      ? "1 Team Member"
                      : `${String(structure.assignmentCount)} Team Members`}
                  </Badge>
                </div>
                <RowMenu
                  label={`Actions for ${structure.name}`}
                  busy={
                    command.isPending &&
                    "id" in command.variables &&
                    command.variables.id === structure.id
                  }
                >
                  <DropdownMenuItem
                    onClick={() => {
                      setEditing(structure);
                    }}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      setAssigning(structure.id);
                    }}
                  >
                    Assign
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onClick={() => {
                      setDeleteError(undefined);
                      setPendingDelete(structure);
                    }}
                  >
                    Delete
                  </DropdownMenuItem>
                </RowMenu>
              </li>
            ))}
          </ul>
        </section>
      )}

      {assignments.items.length > 0 ? (
        <section
          aria-labelledby="leave-assignments-heading"
          className="space-y-3"
        >
          <h3 id="leave-assignments-heading" className="text-lg font-semibold">
            Assignments
          </h3>
          <ul
            aria-label="Assignments"
            className="bg-card divide-y rounded-xl border"
          >
            {assignments.items.map((assignment) => (
              <li
                key={assignment.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {assignment.memberName}
                  </p>
                  <p className="text-muted-foreground text-sm">
                    {assignment.structureName} from{" "}
                    {formatDate(assignment.effectiveFrom)}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={command.isPending}
                  onClick={() => {
                    setListError(undefined);
                    command.mutate(
                      { kind: "unassign", id: assignment.id },
                      {
                        onError: (error) => {
                          setListError(errorMessage(error));
                        },
                      },
                    );
                  }}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <LeaveStructureDialog
        open={editing != null}
        structure={editingStructure}
        types={offered}
        onClose={() => {
          setEditing(null);
        }}
      />
      <LeaveAssignDialog
        open={assigning != null}
        structures={structures.items}
        members={options.members}
        initialStructureId={assigning === "any" ? null : assigning}
        today={today}
        onClose={() => {
          setAssigning(null);
        }}
      />
      <ConfirmDeleteDialog
        name={pendingDelete?.name ?? null}
        description="A structure can be deleted once nobody is assigned to it. Balances already opened stay."
        error={deleteError}
        pending={command.isPending}
        onClose={() => {
          setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete == null) return;
          command.mutate(
            {
              kind: "delete-structure",
              id: pendingDelete.id,
              expectedUpdatedAt: pendingDelete.updatedAt,
            },
            {
              onSuccess: () => {
                setPendingDelete(null);
              },
              onError: (error) => {
                setDeleteError(errorMessage(error));
              },
            },
          );
        }}
      />
    </div>
  );
}
