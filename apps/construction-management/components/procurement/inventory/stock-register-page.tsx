"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { ArrowLeft, ClipboardList, Download } from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { buttonVariants } from "@repo/ui/components/button";
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

import {
  STOCK_REGISTER_COLUMNS,
  STOCK_REGISTER_LABELS,
} from "@/src/procurement/domain/stock-register";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import {
  stockRegisterExportUrl,
  stockRegisterQuery,
  type RegisterRange,
} from "@/src/queries/inventory";

import { useInventoryCan } from "./inventory-access";
import { formatDate, formatQuantity, inventoryPath, localToday } from "./inventory-format";

function monthStart(today: string): string {
  return `${today.slice(0, 8)}01`;
}

function Register({
  location,
  range,
}: {
  location: StockLocation;
  range: RegisterRange;
}) {
  const { data } = useSuspenseQuery(stockRegisterQuery(location, range));
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ClipboardList />
          </EmptyMedia>
          <EmptyTitle>Nothing in stock or moved</EmptyTitle>
          <EmptyDescription>
            No material was held or moved here from {formatDate(range.from)}{" "}
            to {formatDate(range.to)}.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div
      role="region"
      aria-label="Stock Register, scrolls sideways"
      tabIndex={0}
      className="focus-visible:ring-ring/50 overflow-x-auto rounded-lg border outline-none focus-visible:ring-3 [&>[data-slot=table-container]]:overflow-visible"
    >
      <Table aria-label="Stock Register">
        <TableHeader>
          <TableRow>
            <TableHead className="bg-background sticky left-0 min-w-44">
              Material
            </TableHead>
            {STOCK_REGISTER_COLUMNS.map((column) => (
              <TableHead key={column} className="text-right whitespace-nowrap">
                {STOCK_REGISTER_LABELS[column]}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((row) => (
            <TableRow key={row.materialId}>
              <TableCell className="bg-background sticky left-0 max-w-56">
                <span className="block truncate font-medium" title={row.materialName}>
                  {row.materialName}
                </span>
                <span className="text-muted-foreground text-xs">{row.uomName}</span>
              </TableCell>
              {STOCK_REGISTER_COLUMNS.map((column) => (
                <TableCell
                  key={column}
                  className={
                    column === "opening" || column === "closing"
                      ? "text-right font-semibold tabular-nums"
                      : "text-right tabular-nums"
                  }
                >
                  {Number(row[column]) === 0 && column !== "opening" && column !== "closing"
                    ? "—"
                    : formatQuantity(row[column])}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/**
 * The Stock Register of a Project or Store for a date range (CM-506):
 * per material Opening, Received, Transferred in / out, Issued, Received
 * from store, Consumed, Missing, Adjustment and Closing, with an Excel
 * download.
 */
export function StockRegisterPage({
  location,
  backHref,
  today = localToday(),
}: {
  location: StockLocation;
  /** Current Inventory; a Project's by default. */
  backHref?: string;
  today?: string;
}) {
  const can = useInventoryCan(location);
  const [range, setRange] = useState<RegisterRange>({
    from: monthStart(today),
    to: today,
  });
  const valid = range.from !== "" && range.to !== "" && range.from <= range.to;
  const back = backHref ?? inventoryPath(location);
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          {back !== "" && (
            <Link
              href={back}
              className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
            >
              <ArrowLeft aria-hidden="true" className="size-4" />
              Current Inventory
            </Link>
          )}
          <h2 className="font-semibold">Stock Register</h2>
        </div>
        {valid && can("report") && (
          <a
            href={stockRegisterExportUrl(location, range)}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            <Download aria-hidden="true" />
            Download Excel
          </a>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="register-from" className="text-xs">
            From
          </Label>
          <Input
            id="register-from"
            type="date"
            className="h-8 w-40"
            value={range.from}
            max={range.to}
            onChange={(event) => {
              setRange((current) => ({ ...current, from: event.target.value }));
            }}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="register-to" className="text-xs">
            To
          </Label>
          <Input
            id="register-to"
            type="date"
            className="h-8 w-40"
            value={range.to}
            min={range.from}
            onChange={(event) => {
              setRange((current) => ({ ...current, to: event.target.value }));
            }}
          />
        </div>
      </div>
      {!can("report") ? (
        <p className="text-muted-foreground text-sm">
          The Stock Register needs the Report permission on Current Inventory.
        </p>
      ) : valid ? (
        <Suspense
          fallback={
            <div className="space-y-2" aria-busy="true">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          }
        >
          <Register location={location} range={range} />
        </Suspense>
      ) : (
        <p role="alert" className="text-destructive text-sm">
          Choose a start date on or before the end date.
        </p>
      )}
    </div>
  );
}
