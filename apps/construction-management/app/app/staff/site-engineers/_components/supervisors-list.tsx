"use client";

import { formatMobile } from "@repo/auth/construction/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, UserCheck } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  supervisorsQuery,
  useSupervisorCommand,
  type SupervisorItem,
} from "@/src/queries/masters";

import {
  ConfirmDeleteDialog,
  MasterEmpty,
  MasterRow,
  MasterSearch,
  byName,
} from "@/app/app/_components/masters/master-list-parts";
import { SupervisorDialog } from "./supervisor-dialog";
import {
  MasterAddButtonSkeleton,
  MasterListPageSkeleton,
} from "@/app/app/_components/masters/masters-skeletons";

function errorMessage(error: unknown): string {
  return fieldForCode(error, {}).message;
}

function details(supervisor: SupervisorItem): string | null {
  const parts = [
    supervisor.mobile == null ? null : formatMobile(supervisor.mobile),
    supervisor.teamMemberName == null
      ? null
      : `Team Member: ${supervisor.teamMemberName}`,
  ].filter((part): part is string => part != null);
  return parts.length === 0 ? null : parts.join(" · ");
}

/**
 * Search, Add, and per row Edit / Disable / Enable / Delete. Disabled
 * Supervisors stay listed, muted.
 */
export function SupervisorsList() {
  return (
    <Suspense
      fallback={
        <MasterListPageSkeleton
          back={null}
          title="Site Engineers"
          meta={SUPERVISORS_META}
          actions={<MasterAddButtonSkeleton label="Add Site Engineer" />}
          details
        />
      }
    >
      <SupervisorsListContent />
    </Suspense>
  );
}

const SUPERVISORS_META =
  "The people on site who look after a group of Labours.";

function SupervisorsListContent() {
  const { data } = useSuspenseQuery(supervisorsQuery);
  const command = useSupervisorCommand();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<SupervisorItem | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<SupervisorItem | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          (item.mobile ?? "").includes(needle.replace(/\s/g, "")),
      )
      .sort((a, b) => byName.compare(a.name, b.name));
  }, [data.items, query]);

  const addButton = (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add Site Engineer
    </Button>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          title="Site Engineers"
          meta={SUPERVISORS_META}
          actions={addButton}
        />
        {data.items.length === 0 ? (
          <MasterEmpty
            icon={UserCheck}
            title="No Site Engineers yet"
            description="Add the mukadams and Site Engineers your Labours report to. Attendance can then be filtered by Site Engineer."
            action={addButton}
          />
        ) : (
          <div className="space-y-3">
            <MasterSearch
              label="Search Site Engineers"
              value={query}
              onChange={setQuery}
            />
            <FormAlert message={listError} />
            {items.length === 0 ? (
              <p className="bg-card text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No Site Engineer matches “{query.trim()}”.
              </p>
            ) : (
              <ul
                aria-label="Site Engineers"
                className="bg-card divide-y rounded-xl border"
              >
                {items.map((supervisor) => {
                  const line = details(supervisor);
                  return (
                    <MasterRow
                      key={supervisor.id}
                      name={supervisor.name}
                      details={
                        line == null ? null : (
                          <p className="text-muted-foreground truncate text-sm">
                            {line}
                          </p>
                        )
                      }
                      disabled={supervisor.disabled}
                      busy={
                        command.isPending &&
                        "id" in command.variables &&
                        command.variables.id === supervisor.id
                      }
                      editLabel="Edit"
                      onEdit={() => {
                        setEditing(supervisor);
                      }}
                      onToggle={() => {
                        setListError(undefined);
                        command.mutate(
                          {
                            kind: supervisor.disabled ? "enable" : "disable",
                            id: supervisor.id,
                          },
                          {
                            onError: (error) => {
                              setListError(errorMessage(error));
                            },
                          },
                        );
                      }}
                      onDelete={() => {
                        setDeleteError(undefined);
                        setPendingDelete(supervisor);
                      }}
                    />
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
      {editing != null ? (
        <SupervisorDialog
          supervisor={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        name={pendingDelete?.name ?? null}
        description="They will no longer be offered anywhere. A Site Engineer that Labours or attendance name cannot be deleted; disable them instead."
        error={deleteError}
        pending={command.isPending}
        onClose={() => {
          setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete == null) return;
          command.mutate(
            { kind: "delete", id: pendingDelete.id },
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
