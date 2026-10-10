"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { Plus, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useDeferredValue, useState, type ReactNode } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import { PageHeader } from "@/components/app-shell/page-header";
import { FormAlert } from "@/components/auth/form-alert";
import { fieldForCode } from "@/lib/server-errors";
import {
  materialMasterListQuery,
  useMaterialMasterCommand,
  type MaterialMasterFilter,
  type MaterialMasterItem,
  type MaterialMasterList,
} from "@/src/queries/material-masters";

import {
  ConfirmDeleteDialog,
  MasterEmpty,
  MasterRow,
  MasterSearch,
} from "./master-list-parts";

const STATUS_FILTERS: {
  value: MaterialMasterFilter["status"];
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "enabled", label: "Enabled" },
  { value: "disabled", label: "Disabled" },
];

type Item = { id: string; disabled: boolean; updatedAt: string };

/** The words, rows and editor of one procurement master screen (CM-501). */
export type PagedMasterScreen<L extends MaterialMasterList> = {
  list: L;
  singular: string;
  plural: string;
  description: string;
  icon: LucideIcon;
  emptyDescription: string;
  deleteDescription: string;
  searchLabel: string;
  name: (item: MaterialMasterItem<L>) => string;
  details?: (item: MaterialMasterItem<L>) => ReactNode;
  isSeed?: (item: MaterialMasterItem<L>) => boolean;
  editLabel: string;
  /** Add and edit on their own pages (Materials) instead of a dialog. */
  pages?: { newHref: string; editHref: (id: string) => string };
  /** The add / edit dialog; `item` null adds. */
  dialog?: (props: {
    item: MaterialMasterItem<L> | null;
    onClose: () => void;
  }) => ReactNode;
};

/**
 * A procurement master list (CM-501): search, an Enabled / Disabled
 * filter, newest first in pages, and per row Edit / Disable / Enable /
 * Delete. Seed rows can only be disabled and enabled.
 */
export function PagedMasterListScreen<L extends MaterialMasterList>({
  screen,
  filters,
  extra,
}: {
  screen: PagedMasterScreen<L>;
  /** More filters beside the search (Materials: category, Item Type). */
  filters?: ReactNode;
  extra?: Record<string, string | undefined>;
}) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<MaterialMasterFilter["status"]>("all");
  // A page cursor belongs to the filters it was read with; new filters start over.
  const extraKey = JSON.stringify(extra ?? {});
  const [paging, setPaging] = useState<{
    key: string;
    cursor: MaterialMasterFilter["cursor"];
  }>({ key: extraKey, cursor: null });
  const cursor = paging.key === extraKey ? paging.cursor : null;
  const setCursor = (next: MaterialMasterFilter["cursor"]) => {
    setPaging({ key: extraKey, cursor: next });
  };
  const [editing, setEditing] = useState<MaterialMasterItem<L> | "new" | null>(
    null,
  );
  const deferredSearch = useDeferredValue(search);

  const addButton =
    screen.pages != null ? (
      <Link href={screen.pages.newHref} className={buttonVariants()}>
        <Plus aria-hidden="true" />
        Add {screen.singular}
      </Link>
    ) : (
      <Button
        type="button"
        onClick={() => {
          setEditing("new");
        }}
      >
        <Plus aria-hidden="true" />
        Add {screen.singular}
      </Button>
    );

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Masters", href: "/app/masters" }}
          title={screen.plural}
          meta={screen.description}
          actions={addButton}
        />
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <MasterSearch
            label={screen.searchLabel}
            value={search}
            onChange={(value) => {
              setSearch(value);
              setCursor(null);
            }}
          />
          <ToggleGroup
            aria-label="Status"
            value={[status]}
            onValueChange={(value: string[]) => {
              const next = value[0] as
                MaterialMasterFilter["status"] | undefined;
              if (next == null) return;
              setStatus(next);
              setCursor(null);
            }}
            variant="outline"
            size="sm"
          >
            {STATUS_FILTERS.map((filter) => (
              <ToggleGroupItem key={filter.value} value={filter.value}>
                {filter.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          {filters}
        </div>
        <Suspense fallback={<ListSkeleton />}>
          <PagedRows
            screen={screen}
            filter={{ search: deferredSearch, status, cursor, extra }}
            onPage={setCursor}
            onEdit={setEditing}
            addButton={addButton}
          />
        </Suspense>
      </div>
      {editing != null && screen.dialog != null
        ? screen.dialog({
            item: editing === "new" ? null : editing,
            onClose: () => {
              setEditing(null);
            },
          })
        : null}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
    </div>
  );
}

function PagedRows<L extends MaterialMasterList>({
  screen,
  filter,
  onPage,
  onEdit,
  addButton,
}: {
  screen: PagedMasterScreen<L>;
  filter: MaterialMasterFilter;
  onPage: (cursor: MaterialMasterFilter["cursor"]) => void;
  onEdit: (item: MaterialMasterItem<L>) => void;
  addButton: ReactNode;
}) {
  const router = useRouter();
  const { data } = useSuspenseQuery(
    materialMasterListQuery(screen.list, filter),
  );
  const command = useMaterialMasterCommand(screen.list);
  const [pendingDelete, setPendingDelete] =
    useState<MaterialMasterItem<L> | null>(null);
  const [deleteError, setDeleteError] = useState<string | undefined>();
  const [listError, setListError] = useState<string | undefined>();
  const items = data.items as MaterialMasterItem<L>[];

  const filtered =
    filter.search.trim() !== "" ||
    filter.status !== "all" ||
    Object.values(filter.extra ?? {}).some((value) => value != null);
  if (items.length === 0)
    return filtered ? (
      <p className="text-muted-foreground rounded-xl border border-dashed p-6 text-center text-sm">
        No {screen.singular} matches these filters.
      </p>
    ) : (
      <MasterEmpty
        icon={screen.icon}
        title={`No ${screen.plural} yet`}
        description={screen.emptyDescription}
        action={addButton}
      />
    );

  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? screen.singular : screen.plural}
      </p>
      <FormAlert message={listError} />
      <ul
        aria-label={screen.plural}
        className="bg-card divide-y rounded-xl border"
      >
        {items.map((item) => {
          const row = item as MaterialMasterItem<L> & Item;
          const seed = screen.isSeed?.(item) ?? false;
          return (
            <MasterRow
              key={row.id}
              name={screen.name(item)}
              details={screen.details?.(item)}
              isSeed={seed}
              disabled={row.disabled}
              busy={
                command.isPending &&
                "id" in command.variables &&
                command.variables.id === row.id
              }
              editLabel={screen.editLabel}
              onEdit={
                seed
                  ? undefined
                  : () => {
                      if (screen.pages != null)
                        router.push(screen.pages.editHref(row.id));
                      else onEdit(item);
                    }
              }
              onToggle={() => {
                setListError(undefined);
                command.mutate(
                  { kind: row.disabled ? "enable" : "disable", id: row.id },
                  {
                    onError: (error) => {
                      setListError(fieldForCode(error, {}).message);
                    },
                  },
                );
              }}
              onDelete={
                seed
                  ? undefined
                  : () => {
                      setDeleteError(undefined);
                      setPendingDelete(item);
                    }
              }
            />
          );
        })}
      </ul>
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor != null) onPage({ before: data.prevCursor });
            }}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Next
          </Button>
        </div>
      )}
      <ConfirmDeleteDialog
        name={pendingDelete == null ? null : screen.name(pendingDelete)}
        description={screen.deleteDescription}
        error={deleteError}
        pending={command.isPending}
        onClose={() => {
          setPendingDelete(null);
        }}
        onConfirm={() => {
          if (pendingDelete == null) return;
          command.mutate(
            { kind: "delete", id: (pendingDelete as Item).id },
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
