"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { CircleAlert, Plus, Tag, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button } from "@repo/ui/components/button";
import { cn } from "@repo/ui/lib/utils";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  trackingMasterListQuery,
  useTrackingMasterCommand,
  type TrackingMasterList,
} from "@/src/queries/tracking-masters";

import {
  ConfirmDeleteDialog,
  MasterEmpty,
  MasterRow,
  MasterSearch,
  byName,
} from "./master-list-parts";
import { TrackingMasterDialog } from "./tracking-master-dialog";

type Row = {
  id: string;
  name: string;
  isSeed?: boolean;
  disabled?: boolean;
  inUse: boolean;
  updatedAt: string;
};

type Screen = {
  list: TrackingMasterList;
  singular: string;
  plural: string;
  description: string;
  icon: LucideIcon;
  emptyTitle: string;
  emptyDescription: string;
  inUseLine: string;
  deleteDescription: string;
  /** Issue Categories can be disabled; Tags cannot. */
  disables: boolean;
};

const SCREENS: Record<TrackingMasterList, Screen> = {
  "issue-categories": {
    list: "issue-categories",
    singular: "Issue Category",
    plural: "Issue Categories",
    description:
      "What an issue or snag is about. Disabled ones leave the issue form; old issues keep them.",
    icon: CircleAlert,
    emptyTitle: "No Issue Categories",
    emptyDescription:
      "Add what your issues and snags are about, like Quality or Safety.",
    inUseLine: "Used on issues",
    deleteDescription:
      "It will no longer be offered on issues. A category that issues use cannot be deleted; disable it instead.",
    disables: true,
  },
  tags: {
    list: "tags",
    singular: "Tag",
    plural: "Tags",
    description:
      "Labels on Tasks, to find and filter them. The Task form can add one as you type.",
    icon: Tag,
    emptyTitle: "No Tags yet",
    emptyDescription:
      "Add labels for your Tasks, like Critical path or Monsoon work.",
    inUseLine: "On tasks",
    deleteDescription:
      "It will no longer be offered on Tasks. A tag that tasks carry cannot be deleted; take it off those Tasks first.",
    disables: false,
  },
};

function errorMessage(error: unknown): string {
  return fieldForCode(error, {}).message;
}

function TrackingMasterListScreen({ screen }: { screen: Screen }) {
  const { data } = useSuspenseQuery(trackingMasterListQuery(screen.list));
  const rows: Row[] = data.items;
  const command = useTrackingMasterCommand(screen.list);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Row | "new" | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Row | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows
      .filter((item) => item.name.toLowerCase().includes(needle))
      .sort((a, b) => byName.compare(a.name, b.name));
  }, [rows, query]);

  const addButton = data.can.create ? (
    <Button
      type="button"
      onClick={() => {
        setEditing("new");
      }}
    >
      <Plus aria-hidden="true" />
      Add {screen.singular}
    </Button>
  ) : null;

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title={screen.plural}
          meta={screen.description}
          actions={addButton}
        />
        {rows.length === 0 ? (
          <MasterEmpty
            icon={screen.icon}
            title={screen.emptyTitle}
            description={screen.emptyDescription}
            action={addButton}
          />
        ) : (
          <div className="space-y-3">
            <MasterSearch
              label={`Search ${screen.plural}`}
              value={query}
              onChange={setQuery}
            />
            <FormAlert message={listError} />
            {items.length === 0 ? (
              <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
                No {screen.singular} matches “{query.trim()}”.
              </p>
            ) : (
              <ul
                aria-label={screen.plural}
                className="bg-card divide-y rounded-xl border"
              >
                {items.map((item) =>
                  data.can.update || data.can.delete ? (
                    <MasterRow
                      key={item.id}
                      name={item.name}
                      details={
                        item.inUse ? (
                          <p className="text-muted-foreground truncate text-sm">
                            {screen.inUseLine}
                          </p>
                        ) : null
                      }
                      isSeed={item.isSeed ?? false}
                      disabled={item.disabled ?? false}
                      busy={
                        command.isPending &&
                        "id" in command.variables &&
                        command.variables.id === item.id
                      }
                      editLabel="Rename"
                      {...(data.can.update
                        ? {
                            onEdit: () => {
                              setEditing(item);
                            },
                          }
                        : {})}
                      {...(data.can.update && screen.disables
                        ? {
                            onToggle: () => {
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
                            },
                          }
                        : {})}
                      {...(item.inUse || !data.can.delete
                        ? {}
                        : {
                            onDelete: () => {
                              setDeleteError(undefined);
                              setPendingDelete(item);
                            },
                          })}
                    />
                  ) : (
                    <li
                      key={item.id}
                      className="flex min-w-0 flex-wrap items-center gap-2 px-4 py-3"
                    >
                      <span
                        className={cn(
                          "min-w-0 truncate font-medium",
                          item.disabled === true && "text-muted-foreground",
                        )}
                      >
                        {item.name}
                      </span>
                      {item.isSeed === true ? (
                        <Badge variant="secondary">Default</Badge>
                      ) : null}
                      {item.disabled === true ? (
                        <Badge variant="outline">Disabled</Badge>
                      ) : null}
                      {item.inUse ? (
                        <p className="text-muted-foreground w-full truncate text-sm">
                          {screen.inUseLine}
                        </p>
                      ) : null}
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}
      </div>
      {editing != null ? (
        <TrackingMasterDialog
          list={screen.list}
          item={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
          }}
        />
      ) : null}
      <ConfirmDeleteDialog
        name={pendingDelete?.name ?? null}
        description={screen.deleteDescription}
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

/**
 * Masters → Issue Categories (CM-801, ADR CM-0019 §1): search, Add, and
 * per row Rename / Disable / Enable / Delete by the viewer's rights. The
 * 14 Defaults are renamed, disabled and deleted like any other; a
 * category issues use offers no Delete.
 */
export function IssueCategoriesList() {
  return <TrackingMasterListScreen screen={SCREENS["issue-categories"]} />;
}

/**
 * Masters → Tags (CM-801, ADR CM-0019 §1): search, Add, Rename and
 * Delete; a tag tasks carry offers no Delete. Tags are never disabled.
 */
export function TagsList() {
  return <TrackingMasterListScreen screen={SCREENS.tags} />;
}
