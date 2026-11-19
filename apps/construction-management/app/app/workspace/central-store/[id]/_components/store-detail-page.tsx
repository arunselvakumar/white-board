"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import type { Icon } from "@phosphor-icons/react";
import {
  FolderSimpleIcon,
  LockSimpleIcon,
  TruckIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/ssr";
import {
  ArrowLeftRight,
  ClipboardList,
  FolderKanban,
  Package,
  Pencil,
  Trash2,
  Truck,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@repo/ui/components/tabs";
import { EmptyState } from "@repo/ui/components/empty-state";

import { PageHeader } from "@/app/app/_components/app-shell/page-header";
import { DeliveryNotesList } from "@/app/app/_components/procurement/delivery-notes/delivery-notes-list";
import { InventoryPage } from "@/app/app/_components/procurement/inventory/inventory-page";
import { MaterialRequestsList } from "@/app/app/_components/procurement/material-requests/material-requests-list";
import { TransfersList } from "@/app/app/_components/procurement/transfers/transfers-list";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import { storeQuery, useDeleteStore, type Store } from "@/src/queries/stores";

import { centralStoreHref } from "@/app/app/_components/procurement/stores/central-store-parts";
import { StoreConfirmDialog } from "@/app/app/_components/procurement/stores/store-confirm-dialog";
import {
  InventorySkeleton,
  RequestRowsSkeleton,
  TransferRowsSkeleton,
} from "@/app/app/_components/procurement/procurement-skeletons";

function Assigned({
  title,
  items,
  empty,
  icon,
}: {
  title: string;
  items: Store["projects"];
  empty: string;
  icon: Icon;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <EmptyState icon={icon} size="sm" title={empty} />
      ) : (
        <ul aria-label={title} className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="bg-muted rounded-full px-3 py-1 text-sm"
            >
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One Central Store: its stock, the Projects it serves (with its store
 * keepers and Suppliers), the Material Requests raised to it,
 * its Delivery Notes and transfers. Edit and Delete follow Central store
 * update and delete.
 */
export function StoreDetailPage({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { data: store } = useSuspenseQuery(storeQuery(storeId));
  const access = useQuery(procurementAccessQuery(null)).data;
  const may = (
    menu: Parameters<typeof canIn>[1],
    flag: Parameters<typeof canIn>[2],
  ) => access != null && canIn(access, menu, flag);
  const removal = useDeleteStore();
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <PageHeader
          back={{ label: "Central Store", href: centralStoreHref.stores }}
          title={store.name}
          watermark="Central Store"
          meta={[store.address, store.stateName].filter(Boolean).join(" · ")}
          actions={
            <div className="flex flex-wrap gap-2">
              {may("procurement.central_store", "update") ? (
                <Link
                  href={centralStoreHref.editStore(store.id)}
                  className={buttonVariants({ variant: "outline" })}
                >
                  <Pencil aria-hidden="true" />
                  Edit
                </Link>
              ) : null}
              {may("procurement.central_store", "delete") ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setDeleting(true);
                  }}
                >
                  <Trash2 aria-hidden="true" />
                  Delete
                </Button>
              ) : null}
            </div>
          }
        />
        <Tabs defaultValue="stock" className="gap-4">
          <TabsList>
            <TabsTrigger value="stock">
              <Package aria-hidden="true" />
              Stock
            </TabsTrigger>
            <TabsTrigger value="projects">
              <FolderKanban aria-hidden="true" />
              Projects
            </TabsTrigger>
            <TabsTrigger value="requests">
              <ClipboardList aria-hidden="true" />
              Material Requests
            </TabsTrigger>
            <TabsTrigger value="notes">
              <Truck aria-hidden="true" />
              Delivery Notes
            </TabsTrigger>
            <TabsTrigger value="transfers">
              <ArrowLeftRight aria-hidden="true" />
              Transfers
            </TabsTrigger>
          </TabsList>
          <TabsContent value="stock">
            <Suspense fallback={<InventorySkeleton />}>
              <InventoryPage
                location={{ kind: "store", id: store.id }}
                registerHref={centralStoreHref.register(store.id)}
              />
            </Suspense>
          </TabsContent>
          <TabsContent value="projects" className="space-y-5">
            <Assigned
              title="Projects"
              icon={FolderSimpleIcon}
              items={store.projects}
              empty="No Projects."
            />
            <Assigned
              title="Store keepers"
              icon={UsersThreeIcon}
              items={store.keepers}
              empty="No store keepers yet."
            />
            <Assigned
              title="Suppliers"
              icon={TruckIcon}
              items={store.suppliers}
              empty="No Suppliers yet."
            />
          </TabsContent>
          <TabsContent value="requests">
            {may("procurement.material_requests", "read") ? (
              <Suspense
                fallback={
                  <RequestRowsSkeleton label="Loading Material Requests" />
                }
              >
                <MaterialRequestsList
                  storeId={store.id}
                  hrefFor={(request) => centralStoreHref.request(request.id)}
                />
              </Suspense>
            ) : (
              <EmptyState
                icon={LockSimpleIcon}
                tone="neutral"
                orbit={false}
                title="You cannot see Material Requests."
                description="Ask the Owner for Central Store (MR) access."
              />
            )}
          </TabsContent>
          <TabsContent value="notes">
            {may("procurement.delivery_notes", "read") ? (
              <Suspense
                fallback={
                  <RequestRowsSkeleton
                    label="Loading Delivery Notes"
                    count={false}
                  />
                }
              >
                <DeliveryNotesList storeId={store.id} />
              </Suspense>
            ) : (
              <EmptyState
                icon={LockSimpleIcon}
                tone="neutral"
                orbit={false}
                title="You cannot see Delivery Notes."
                description="Ask the Owner for Delivery Note access."
              />
            )}
          </TabsContent>
          <TabsContent value="transfers">
            <Suspense fallback={<TransferRowsSkeleton />}>
              <TransfersList
                location={{ kind: "store", id: store.id }}
                hrefFor={(transferId) =>
                  centralStoreHref.transfer(store.id, transferId)
                }
                newHref={centralStoreHref.newTransfer(store.id)}
              />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
      <StoreConfirmDialog
        open={deleting}
        title={`Delete ${store.name}?`}
        description="A store that holds stock or has open requests, Delivery Notes or transfers cannot be deleted."
        action="Delete"
        pendingLabel="Deleting…"
        destructive
        onConfirm={async () => {
          await removal.mutateAsync(store);
          router.push(centralStoreHref.stores);
        }}
        onClose={() => {
          setDeleting(false);
        }}
      />
    </div>
  );
}
