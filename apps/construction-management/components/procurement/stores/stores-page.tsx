"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, Plus, Warehouse } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { PageHeader } from "@/components/app-shell/page-header";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import { storesQuery, type Store } from "@/src/queries/stores";

import {
  CENTRAL_INVENTORY_PATH,
  centralStoreHref,
} from "./central-store-parts";

function count(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function StoreCard({ store }: { store: Store }) {
  return (
    <li className="bg-card hover:bg-muted/40 relative flex min-w-0 items-center gap-3 rounded-xl border p-3 transition-colors">
      <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-lg">
        <Warehouse aria-hidden="true" className="size-5" />
      </span>
      <Link
        href={centralStoreHref.store(store.id)}
        className="focus-visible:ring-ring min-w-0 flex-1 rounded-sm outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:ring-2"
      >
        <span className="block truncate text-sm font-medium">{store.name}</span>
        <span className="text-muted-foreground block truncate text-xs">
          {[
            store.stateName,
            count(store.projects.length, "Project", "Projects"),
            count(store.keepers.length, "store keeper", "store keepers"),
          ]
            .filter((part) => part != null)
            .join(" · ")}
        </span>
      </Link>
      <ChevronRight
        aria-hidden="true"
        className="text-muted-foreground size-4 shrink-0"
      />
    </li>
  );
}

/**
 * Workspace → Central Store (CM-508): the Company's stores. Add store
 * follows Central store create; Central Inventory links across.
 */
export function StoresPage() {
  const { data } = useSuspenseQuery(storesQuery());
  const access = useQuery(procurementAccessQuery(null)).data;
  const canCreate =
    access != null && canIn(access, "procurement.central_store", "create");
  const canInventory =
    access != null && canIn(access, "procurement.central_inventory", "read");
  const add = (
    <Link href={centralStoreHref.newStore} className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Add store
    </Link>
  );
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader
          back={{ label: "Workspace", href: "/app/workspace" }}
          title="Central Store"
          meta={
            data.total > 0
              ? count(data.total, "store", "stores")
              : "Warehouses that serve your Projects."
          }
          actions={
            <div className="flex flex-wrap gap-2">
              {canInventory ? (
                <Link
                  href={CENTRAL_INVENTORY_PATH}
                  className={buttonVariants({ variant: "outline" })}
                >
                  Central Inventory
                </Link>
              ) : null}
              {canCreate && data.items.length > 0 ? add : null}
            </div>
          }
        />
        {data.items.length === 0 ? (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Warehouse />
              </EmptyMedia>
              <EmptyTitle>No stores yet</EmptyTitle>
              <EmptyDescription>
                {canCreate
                  ? "Add a store, choose the Projects it serves and its store keepers. Sites then raise Material Requests to it."
                  : "The Company's Central Stores show here."}
              </EmptyDescription>
            </EmptyHeader>
            {canCreate ? <EmptyContent>{add}</EmptyContent> : null}
          </Empty>
        ) : (
          <ul aria-label="Stores" className="grid gap-3 sm:grid-cols-2">
            {data.items.map((store) => (
              <StoreCard key={store.id} store={store} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
