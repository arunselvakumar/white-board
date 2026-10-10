"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { PackageCheck, Plus } from "lucide-react";
import Link from "next/link";
import { Suspense, useDeferredValue, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import { Skeleton } from "@repo/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import {
  goodsReceiptsQuery,
  type GoodsReceiptListFilter,
} from "@/src/queries/goods-receipts";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";

import {
  ChoiceSelect,
  formatDate,
  goodsReceivedPath,
  money,
} from "./goods-receipt-parts";

const PO_FILTERS = [
  { value: "all", label: "All" },
  { value: "with", label: "Against PO" },
  { value: "without", label: "Without PO" },
] as const;

const ALL_SUPPLIERS = "all";

/**
 * A Project's Goods Received tab (CM-505): GRNs newest first with filters
 * by GR Date, supplier, PO / without PO and a search over number, invoice
 * and challan; values only with Financial.
 */
export function GoodsReceiptsList({ projectId }: { projectId: string }) {
  const access = useQuery(procurementAccessQuery(projectId)).data;
  const canCreate =
    access != null && canIn(access, "procurement.material_received", "create");
  const [filter, setFilter] = useState<GoodsReceiptListFilter>({
    location: { kind: "project", id: projectId },
    from: "",
    to: "",
    supplierId: null,
    purchaseOrder: null,
    search: "",
    cursor: null,
  });
  // Typing in search keeps the last rows on screen while the next page loads.
  const shown = useDeferredValue(filter);
  const change = (next: Partial<GoodsReceiptListFilter>) => {
    setFilter((current) => ({ ...current, ...next, cursor: null }));
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-lg font-semibold">Goods Received</h1>
        {canCreate && (
          <Link
            href={goodsReceivedPath(projectId, "/new")}
            className={buttonVariants()}
          >
            <Plus aria-hidden="true" />
            Record Goods Receipt
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="space-y-1 sm:w-64">
          <Label htmlFor="grn-search" className="text-xs">
            Search
          </Label>
          <Input
            id="grn-search"
            type="search"
            className="h-10"
            placeholder="GRN, invoice or challan no"
            value={filter.search}
            onChange={(event) => {
              change({ search: event.target.value });
            }}
          />
        </div>
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="grn-from" className="text-xs">
              From
            </Label>
            <Input
              id="grn-from"
              type="date"
              className="h-10 sm:w-40"
              value={filter.from}
              onChange={(event) => {
                change({ from: event.target.value });
              }}
            />
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor="grn-to" className="text-xs">
              To
            </Label>
            <Input
              id="grn-to"
              type="date"
              className="h-10 sm:w-40"
              value={filter.to}
              onChange={(event) => {
                change({ to: event.target.value });
              }}
            />
          </div>
        </div>
        <ToggleGroup
          aria-label="Purchase Order"
          value={[filter.purchaseOrder ?? "all"]}
          onValueChange={(value: string[]) => {
            const next = value[0];
            if (next == null) return;
            change({
              purchaseOrder:
                next === "with" || next === "without" ? next : null,
            });
          }}
          variant="outline"
          size="sm"
        >
          {PO_FILTERS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <Suspense
        fallback={
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        }
      >
        <ReceiptRows
          projectId={projectId}
          filter={shown}
          onSupplier={(supplierId) => {
            change({ supplierId });
          }}
          onPage={(cursor) => {
            setFilter((current) => ({ ...current, cursor }));
          }}
        />
      </Suspense>
    </div>
  );
}

function ReceiptRows({
  projectId,
  filter,
  onSupplier,
  onPage,
}: {
  projectId: string;
  filter: GoodsReceiptListFilter;
  onSupplier: (supplierId: string | null) => void;
  onPage: (cursor: GoodsReceiptListFilter["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(goodsReceiptsQuery(filter));
  const filtered =
    filter.from !== "" ||
    filter.to !== "" ||
    filter.supplierId != null ||
    filter.purchaseOrder != null ||
    filter.search.trim() !== "";
  const supplierFilter =
    data.suppliers.length > 1 || filter.supplierId != null ? (
      <div className="sm:w-64">
        <ChoiceSelect
          label="Supplier"
          value={filter.supplierId ?? ALL_SUPPLIERS}
          items={[
            { value: ALL_SUPPLIERS, label: "All suppliers" },
            ...data.suppliers.map((supplier) => ({
              value: supplier.id,
              label: supplier.name,
            })),
          ]}
          onChange={(value) => {
            onSupplier(value === ALL_SUPPLIERS ? null : value);
          }}
        />
      </div>
    ) : null;

  if (data.items.length === 0)
    return (
      <div className="space-y-3">
        {supplierFilter}
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageCheck />
            </EmptyMedia>
            <EmptyTitle>
              {filtered ? "No Goods Receipts match" : "No goods received yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filtered
                ? "Try another date range, supplier or search."
                : "Record a Goods Receipt when material arrives at the site, against a Purchase Order or without one."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );

  return (
    <div className="space-y-3">
      {supplierFilter}
      <p className="text-muted-foreground text-sm">
        {data.total === 1
          ? "1 Goods Receipt"
          : `${String(data.total)} Goods Receipts`}
      </p>
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>GRN</TableHead>
              <TableHead>GR Date</TableHead>
              <TableHead>Inventory Date</TableHead>
              <TableHead>Supplier</TableHead>
              <TableHead>Purchase Order</TableHead>
              {data.financial && (
                <TableHead className="text-right">Value</TableHead>
              )}
              <TableHead className="text-right">Lines</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-medium whitespace-nowrap">
                  <Link
                    href={goodsReceivedPath(projectId, `/${item.id}`)}
                    className="text-primary hover:underline"
                  >
                    {item.number}
                  </Link>
                  {item.invoiceNo != null && (
                    <span className="text-muted-foreground block text-xs font-normal">
                      Invoice {item.invoiceNo}
                    </span>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(item.receiptDate)}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {formatDate(item.inventoryDate)}
                </TableCell>
                <TableCell className="max-w-48 truncate">
                  {item.supplier.name}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {item.purchaseOrder == null ? (
                    <Badge variant="outline">Without PO</Badge>
                  ) : (
                    item.purchaseOrder.number
                  )}
                </TableCell>
                {data.financial && (
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {money(item.totalValue)}
                  </TableCell>
                )}
                <TableCell className="text-right tabular-nums">
                  {item.lineCount}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {(data.prevCursor != null || data.nextCursor != null) && (
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.prevCursor == null}
            onClick={() => {
              if (data.prevCursor != null) onPage({ before: data.prevCursor });
            }}
          >
            Newer
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              if (data.nextCursor != null) onPage({ after: data.nextCursor });
            }}
          >
            Older
          </Button>
        </div>
      )}
    </div>
  );
}
