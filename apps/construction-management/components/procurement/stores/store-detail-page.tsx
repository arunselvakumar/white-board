"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Package, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";

import { PageHeader } from "@/components/app-shell/page-header";
import { DeliveryNotesList } from "@/components/procurement/delivery-notes/delivery-notes-list";
import { MaterialRequestsList } from "@/components/procurement/material-requests/material-requests-list";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";
import {
  storeQuery,
  storeStockQuery,
  useDeleteStore,
  type Store,
} from "@/src/queries/stores";

import {
  CENTRAL_INVENTORY_PATH,
  centralStoreHref,
  formatQuantity,
  ScrollRegion,
  StockStateBadge,
} from "./central-store-parts";
import { StoreConfirmDialog } from "./store-confirm-dialog";

const loading = <p className="text-muted-foreground text-sm">Loading…</p>;

/** The store's stock per material; scrolls inside its own box on a phone. */
export function StoreStock({ storeId }: { storeId: string }) {
  const { data: rows } = useSuspenseQuery(storeStockQuery(storeId));
  if (rows.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyTitle>No stock yet</EmptyTitle>
          <EmptyDescription>
            Goods Receipts, transfers in and opening stock show here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <ScrollRegion label="Store stock, scrolls sideways">
      <Table aria-label="Store stock">
        <TableHeader>
          <TableRow>
            <TableHead>Material</TableHead>
            <TableHead className="text-right">Stock</TableHead>
            <TableHead className="text-right">In transit</TableHead>
            <TableHead>State</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.materialId}>
              <TableCell className="min-w-40">
                <span className="block font-medium">{row.materialName}</span>
                {row.categoryName == null ? null : (
                  <span className="text-muted-foreground block text-xs">
                    {row.categoryName}
                  </span>
                )}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {formatQuantity(row.stock)} {row.uomName}
              </TableCell>
              <TableCell className="text-right whitespace-nowrap tabular-nums">
                {formatQuantity(row.inTransit)}
              </TableCell>
              <TableCell>
                <StockStateBadge state={row.state} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollRegion>
  );
}

function Assigned({
  title,
  items,
  empty,
}: {
  title: string;
  items: Store["projects"];
  empty: string;
}) {
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-medium">{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">{empty}</p>
      ) : (
        <ul aria-label={title} className="flex flex-wrap gap-2">
          {items.map((item) => (
            <li key={item.id} className="bg-muted rounded-full px-3 py-1 text-sm">
              {item.name}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One Central Store (CM-508): its stock, the Projects it serves (with
 * its store keepers and Suppliers), the Material Requests raised to it,
 * its Delivery Notes and transfers. Edit and Delete follow Central store
 * update and delete.
 */
export function StoreDetailPage({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { data: store } = useSuspenseQuery(storeQuery(storeId));
  const access = useQuery(procurementAccessQuery(null)).data;
  const may = (menu: Parameters<typeof canIn>[1], flag: Parameters<typeof canIn>[2]) =>
    access != null && canIn(access, menu, flag);
  const removal = useDeleteStore();
  const [deleting, setDeleting] = useState(false);

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <PageHeader
          back={{ label: "Central Store", href: centralStoreHref.stores }}
          title={store.name}
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
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <TabsList>
              <TabsTrigger value="stock">Stock</TabsTrigger>
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="requests">Material Requests</TabsTrigger>
              <TabsTrigger value="notes">Delivery Notes</TabsTrigger>
              <TabsTrigger value="transfers">Transfers</TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="stock">
            <Suspense fallback={loading}>
              <StoreStock storeId={store.id} />
            </Suspense>
          </TabsContent>
          <TabsContent value="projects" className="space-y-5">
            <Assigned title="Projects" items={store.projects} empty="No Projects." />
            <Assigned
              title="Store keepers"
              items={store.keepers}
              empty="No store keepers yet."
            />
            <Assigned title="Suppliers" items={store.suppliers} empty="No Suppliers yet." />
          </TabsContent>
          <TabsContent value="requests">
            {may("procurement.material_requests", "read") ? (
              <Suspense fallback={loading}>
                <MaterialRequestsList
                  storeId={store.id}
                  hrefFor={(request) => centralStoreHref.request(request.id)}
                />
              </Suspense>
            ) : (
              <p className="text-muted-foreground text-sm">
                You cannot see Material Requests. Ask the Owner for Central
                Store (MR) access.
              </p>
            )}
          </TabsContent>
          <TabsContent value="notes">
            {may("procurement.delivery_notes", "read") ? (
              <Suspense fallback={loading}>
                <DeliveryNotesList storeId={store.id} />
              </Suspense>
            ) : (
              <p className="text-muted-foreground text-sm">
                You cannot see Delivery Notes. Ask the Owner for Delivery Note
                access.
              </p>
            )}
          </TabsContent>
          <TabsContent value="transfers">
            <p className="text-muted-foreground text-sm">
              Material Transfers from and to this store are listed with each
              Project&apos;s Material Transfers; what is on its way here shows
              as In transit on the Stock tab and in{" "}
              <Link href={CENTRAL_INVENTORY_PATH} className="text-primary underline-offset-4 hover:underline">
                Central Inventory
              </Link>
              .
            </p>
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
