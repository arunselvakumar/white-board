"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  lookupListQuery,
  useLookupCommand,
  type LookupItem,
} from "@/src/queries/masters";

import { LookupNameDialog } from "./lookup-name-dialog";
import {
  DEPARTMENTS_SCREEN,
  LABOUR_CATEGORIES_SCREEN,
  type LookupScreenConfig,
} from "./lookup-screens";
import {
  ConfirmDeleteDialog,
  MasterEmpty,
  MasterRow,
  MasterSearch,
  byName,
} from "./master-list-parts";

function errorMessage(error: unknown): string {
  return fieldForCode(error, {}).message;
}

/**
 * A name-only masters list (CM-203): search, Add, and per row Rename /
 * Disable / Enable / Delete. Default (seed) rows can only be disabled and
 * enabled; disabled rows stay listed, muted.
 */
export function LookupListScreen({ config }: { config: LookupScreenConfig }) {
  const { data } = useSuspenseQuery(lookupListQuery(config.list));
  const command = useLookupCommand(config.list);
  const [query, setQuery] = useState("");
  /** Null closed, "new" adds, an item renames. */
  const [editing, setEditing] = useState<LookupItem | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<LookupItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.items
      .filter((item) => item.name.toLowerCase().includes(needle))
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
      Add {config.singular}
    </Button>
  );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title={config.plural}
          meta={config.description}
          actions={addButton}
        />
        {data.items.length === 0 ? (
          <MasterEmpty
            icon={config.icon}
            title={`No ${config.plural} yet`}
            description={config.emptyDescription}
            action={addButton}
          />
        ) : (
          <div className="space-y-3">
            <MasterSearch
              label={`Search ${config.plural}`}
              value={query}
              onChange={setQuery}
            />
            <FormAlert message={listError} />
            {items.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No {config.singular} matches “{query.trim()}”.
              </p>
            ) : (
              <ul
                aria-label={config.plural}
                className="bg-card divide-y rounded-xl border"
              >
                {items.map((item) => (
                  <MasterRow
                    key={item.id}
                    name={item.name}
                    isSeed={item.isSeed}
                    disabled={item.disabled}
                    busy={
                      command.isPending &&
                      "id" in command.variables &&
                      command.variables.id === item.id
                    }
                    editLabel="Rename"
                    onEdit={
                      item.isSeed
                        ? undefined
                        : () => {
                            setEditing(item);
                          }
                    }
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
        <LookupNameDialog
          config={config}
          item={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        name={pendingDelete?.name ?? null}
        description={config.deleteDescription}
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

/** Masters → Labour Categories (CM-203). */
export function LabourCategoriesList() {
  return <LookupListScreen config={LABOUR_CATEGORIES_SCREEN} />;
}

/** Masters → Departments (CM-203). */
export function DepartmentsList() {
  return <LookupListScreen config={DEPARTMENTS_SCREEN} />;
}
