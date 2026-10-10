"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@repo/ui/components/button";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  developmentListQuery,
  useDevelopmentCommand,
  type DevelopmentItem,
} from "@/src/queries/developments";
import { projectOptionsQuery } from "@/src/queries/projects";

import {
  AssignProjectsDialog,
  DevelopmentNameDialog,
} from "./development-dialogs";
import {
  AMENITIES_SCREEN,
  COMMON_DEVELOPMENTS_SCREEN,
  type DevelopmentScreenConfig,
} from "./development-screens";
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

/** "On Kumari Heights, Zen Villas" or "Not on any Project". */
function projectsLine(ids: readonly string[], names: Map<string, string>) {
  const known = ids.flatMap((id) => names.get(id) ?? []);
  return known.length === 0 ? "Not on any Project" : `On ${known.join(", ")}`;
}

type Dialog =
  { kind: "add" } | { kind: "rename" | "assign"; item: DevelopmentItem } | null;

/**
 * Amenities or Common Developments (CM-404): search, Add (with Projects),
 * and per row Rename / Assign Projects / Disable / Enable / Delete. Default
 * (seed) rows can only be disabled, enabled and assigned; each row says
 * which Projects have it.
 */
export function DevelopmentListScreen({
  config,
}: {
  config: DevelopmentScreenConfig;
}) {
  const { data } = useSuspenseQuery(developmentListQuery(config.list));
  const { data: projects } = useSuspenseQuery(projectOptionsQuery);
  const command = useDevelopmentCommand(config.list);
  const [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [pendingDelete, setPendingDelete] = useState<DevelopmentItem | null>(
    null,
  );
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const names = useMemo(
    () => new Map(projects.items.map((project) => [project.id, project.name])),
    [projects.items],
  );
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
        setDialog({ kind: "add" });
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
                    details={
                      <p className="text-muted-foreground truncate text-sm">
                        {projectsLine(item.projectIds, names)}
                      </p>
                    }
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
                            setDialog({ kind: "rename", item });
                          }
                    }
                    moreActions={[
                      {
                        label: "Assign Projects",
                        onSelect: () => {
                          setDialog({ kind: "assign", item });
                        },
                      },
                    ]}
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
      {dialog?.kind === "add" ? (
        <DevelopmentNameDialog
          config={config}
          item={null}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "rename" ? (
        <DevelopmentNameDialog
          config={config}
          item={dialog.item}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "assign" ? (
        <AssignProjectsDialog
          config={config}
          item={dialog.item}
          onClose={() => {
            setDialog(null);
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

/** Masters → Amenities (CM-404). */
export function AmenitiesList() {
  return <DevelopmentListScreen config={AMENITIES_SCREEN} />;
}

/** Masters → Common Developments (CM-404). */
export function CommonDevelopmentsList() {
  return <DevelopmentListScreen config={COMMON_DEVELOPMENTS_SCREEN} />;
}
