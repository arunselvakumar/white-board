"use client";

import {
  MagnifyingGlassIcon,
  TreeStructureIcon,
} from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Suspense, useMemo, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import {
  ConfirmDeleteDialog,
  MasterEmpty,
  MasterRow,
  MasterSearch,
  byName,
} from "@/app/app/_components/masters/master-list-parts";
import {
  MasterAddButtonSkeleton,
  MasterListPageSkeleton,
} from "@/app/app/_components/masters/masters-skeletons";
import { DEPARTMENTS_PATH, MANAGE_DEPARTMENTS } from "@/lib/departments-nav";
import { fieldForCode } from "@/lib/server-errors";
import {
  departmentsQuery,
  useDepartmentCommand,
  type DepartmentItem,
} from "@/src/queries/departments";

import { DepartmentNameDialog } from "./department-name-dialog";

/** What the viewer's Departments menu allows (ADR CM-0049 §5). */
export type DepartmentActions = {
  create: boolean;
  update: boolean;
  delete: boolean;
};

const TITLE = MANAGE_DEPARTMENTS.label;
const META =
  "Your Company's departments. Human Resources and Marketing are system departments: they keep their names and cannot be deleted.";
const BACK = { label: "Departments", href: DEPARTMENTS_PATH } as const;

/**
 * Manage Departments (ADR CM-0049): search, Add Department, and per
 * Company-made row Rename and Delete. System rows (Human Resources,
 * Marketing) carry a System badge and no actions.
 */
export function DepartmentsList({ actions }: { actions: DepartmentActions }) {
  return (
    <Suspense
      fallback={
        <MasterListPageSkeleton
          back={BACK}
          title={TITLE}
          meta={META}
          actions={
            actions.create ? (
              <MasterAddButtonSkeleton label="Add Department" />
            ) : undefined
          }
        />
      }
    >
      <DepartmentsListContent actions={actions} />
    </Suspense>
  );
}

function DepartmentsListContent({ actions }: { actions: DepartmentActions }) {
  const { data } = useSuspenseQuery(departmentsQuery);
  const command = useDepartmentCommand();
  const [query, setQuery] = useState("");
  /** Null closed, "new" adds, an item renames. */
  const [editing, setEditing] = useState<DepartmentItem | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DepartmentItem | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | undefined>();

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.items
      .filter((item) => item.name.toLowerCase().includes(needle))
      .sort((a, b) => byName.compare(a.name, b.name));
  }, [data.items, query]);

  const addButton = actions.create ? (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add Department
    </Button>
  ) : undefined;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader back={BACK} title={TITLE} meta={META} actions={addButton} />
        {data.items.length === 0 ? (
          <MasterEmpty
            icon={TreeStructureIcon}
            tone="sky"
            title="No Departments yet"
            description="Add the departments your Company is organised into, like Accounts or Purchase."
            action={addButton}
          />
        ) : (
          <div className="space-y-3">
            <MasterSearch
              label="Search Departments"
              value={query}
              onChange={setQuery}
            />
            {items.length === 0 ? (
              <EmptyState
                icon={MagnifyingGlassIcon}
                tone="neutral"
                title={`No Department matches “${query.trim()}”.`}
                className="bg-card text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm"
              />
            ) : (
              <ul
                aria-label="Departments"
                className="bg-card divide-y rounded-xl border"
              >
                {items.map((item) => (
                  <MasterRow
                    key={item.id}
                    name={item.name}
                    isSeed={item.isSystem}
                    seedLabel="System"
                    disabled={false}
                    busy={
                      command.isPending &&
                      "id" in command.variables &&
                      command.variables.id === item.id
                    }
                    editLabel="Rename"
                    onEdit={
                      item.isSystem || !actions.update
                        ? undefined
                        : () => {
                            setEditing(item);
                          }
                    }
                    onDelete={
                      item.isSystem || !actions.delete
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
        <DepartmentNameDialog
          item={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        name={pendingDelete?.name ?? null}
        description="It leaves your list of departments. Nothing else uses departments yet, so nothing else changes."
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
                setDeleteError(fieldForCode(error, {}).message);
              },
            },
          );
        }}
      />
    </div>
  );
}
