"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleOff,
  LayoutGrid,
  Plus,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Suspense,
  useDeferredValue,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { FilterTabs, type FilterTab } from "@repo/ui/components/filter-tabs";
import { cn } from "@repo/ui/lib/utils";

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
import { MasterRowsSkeleton } from "./masters-skeletons";

const STATUS_FILTERS: FilterTab<MaterialMasterFilter["status"]>[] = [
  { value: "all", label: "All", icon: LayoutGrid },
  { value: "enabled", label: "Enabled", icon: CircleCheck },
  { value: "disabled", label: "Disabled", icon: CircleOff },
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
  const extraKey = JSON.stringify(extra ?? {});
  // Filter and page changes keep the old rows on screen, dimmed (ADR-0047).
  // The extra filters live in the parent, so they are deferred here.
  const [isPending, startTransition] = useTransition();
  const deferredExtraKey = useDeferredValue(extraKey);
  const deferredExtra = useMemo(
    () => JSON.parse(deferredExtraKey) as Record<string, string | undefined>,
    [deferredExtraKey],
  );
  const stale = isPending || deferredExtraKey !== extraKey;
  // A page cursor belongs to the filters it was read with; new filters start over.
  const [paging, setPaging] = useState<{
    key: string;
    cursor: MaterialMasterFilter["cursor"];
  }>({ key: extraKey, cursor: null });
  const cursor = paging.key === deferredExtraKey ? paging.cursor : null;
  const setCursor = (next: MaterialMasterFilter["cursor"]) => {
    startTransition(() => {
      setPaging({ key: deferredExtraKey, cursor: next });
    });
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
          <FilterTabs
            aria-label="Status"
            items={STATUS_FILTERS}
            value={status}
            onValueChange={(next) => {
              startTransition(() => {
                setStatus(next);
                setCursor(null);
              });
            }}
          />
          {filters}
        </div>
        <Suspense
          fallback={
            <MasterRowsSkeleton
              count
              details={screen.details != null}
              label={`Loading ${screen.plural}`}
            />
          }
        >
          <PagedRows
            className={cn(stale && "opacity-60 transition-opacity")}
            screen={screen}
            filter={{
              search: deferredSearch,
              status,
              cursor,
              extra: extra == null ? undefined : deferredExtra,
            }}
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

function PagedRows<L extends MaterialMasterList>({
  screen,
  filter,
  onPage,
  onEdit,
  addButton,
  className,
}: {
  screen: PagedMasterScreen<L>;
  filter: MaterialMasterFilter;
  onPage: (cursor: MaterialMasterFilter["cursor"]) => void;
  onEdit: (item: MaterialMasterItem<L>) => void;
  addButton: ReactNode;
  className?: string;
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
    <div className={cn("space-y-3", className)}>
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
