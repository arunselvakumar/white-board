"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Hammer, Plus } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  useWorkTypeCommand,
  workTypesQuery,
  type WorkTypeItem,
} from "@/src/queries/work-types";

import {
  ConfirmDeleteDialog,
  MasterEmpty,
  MasterRow,
  MasterSearch,
  byName,
} from "./master-list-parts";
import { WorkTypeDialog } from "./work-type-dialog";
import {
  MasterAddButtonSkeleton,
  MasterListPageSkeleton,
} from "./masters-skeletons";

function errorMessage(error: unknown): string {
  return fieldForCode(error, {}).message;
}

/** "RCC · 3 Materials" under a Work Type's name. */
function detailsOf(item: WorkTypeItem): string {
  const count = item.materials.length;
  const materials =
    count === 0
      ? "No Materials"
      : `${String(count)} Material${count === 1 ? "" : "s"}`;
  return `${item.departmentName} · ${materials}`;
}

/**
 * Masters → Work Types (CM-601): search by name or Department, Add, and per
 * row Edit / Disable / Enable / Delete. The Default Work Type (RCC) is
 * edited for its Materials only and never deleted; disabled rows stay
 * listed, muted.
 */
export function WorkTypesList() {
  return (
    <Suspense
      fallback={
        <MasterListPageSkeleton
          title="Work Types"
          meta={WORK_TYPES_META}
          actions={<MasterAddButtonSkeleton label="Add Work Type" />}
          details
        />
      }
    >
      <WorkTypesListContent />
    </Suspense>
  );
}

const WORK_TYPES_META =
  "What crews do within a Department, with the Materials they use.";

function WorkTypesListContent() {
  const { data } = useSuspenseQuery(workTypesQuery());
  const command = useWorkTypeCommand();
  const [query, setQuery] = useState("");
  /** Null closed, "new" adds, an item edits. */
  const [editing, setEditing] = useState<WorkTypeItem | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<WorkTypeItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.items
      .filter(
        (item) =>
          item.name.toLowerCase().includes(needle) ||
          item.departmentName.toLowerCase().includes(needle),
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
      Add Work Type
    </Button>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title="Work Types"
          meta={WORK_TYPES_META}
          actions={addButton}
        />
        {data.items.length === 0 ? (
          <MasterEmpty
            icon={Hammer}
            title="No Work Types yet"
            description="Add the kinds of work your crews do, like Column casting under RCC."
            action={addButton}
          />
        ) : (
          <div className="space-y-3">
            <MasterSearch
              label="Search Work Types"
              value={query}
              onChange={setQuery}
            />
            <FormAlert message={listError} />
            {items.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No Work Type matches “{query.trim()}”.
              </p>
            ) : (
              <ul
                aria-label="Work Types"
                className="bg-card divide-y rounded-xl border"
              >
                {items.map((item) => (
                  <MasterRow
                    key={item.id}
                    name={item.name}
                    details={
                      <p className="text-muted-foreground truncate text-sm">
                        {detailsOf(item)}
                      </p>
                    }
                    isSeed={item.isSeed}
                    disabled={item.disabled}
                    busy={
                      command.isPending &&
                      "id" in command.variables &&
                      command.variables.id === item.id
                    }
                    editLabel="Edit"
                    onEdit={() => {
                      setEditing(item);
                    }}
                    onToggle={() => {
                      setListError(undefined);
                      command.mutate(
                        {
                          kind: item.disabled ? "enable" : "disable",
                          id: item.id,
                        },
                        {
                          onError: (error) => {
                            setListError(errorMessage(error));
                          },
                        },
                      );
                    }}
                    onDelete={
                      item.isSeed
                        ? undefined
                        : () => {
                            setDeleteError(undefined);
                            setPendingDelete(item);
                          }
                    }
                  />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {editing != null ? (
        <WorkTypeDialog
          item={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        name={pendingDelete?.name ?? null}
        description="It will no longer be offered on worksheets. A Work Type that Daily Worksheets use cannot be deleted; disable it instead."
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
