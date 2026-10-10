"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { Suspense, useState } from "react";
import { Button, buttonVariants } from "@repo/ui/components/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import { Skeleton } from "@repo/ui/components/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@repo/ui/components/toggle-group";

import {
  formatDate,
  formatQuantity,
} from "@/components/procurement/inventory/inventory-format";
import {
  TRANSFER_STATUS_LABELS,
  TRANSFER_STATUSES,
  type TransferStatus,
} from "@/src/procurement/domain/material-transfer";
import {
  sameStockLocation,
  type StockLocation,
} from "@/src/procurement/domain/stock-location";
import {
  transfersQuery,
  type MaterialTransfer,
  type TransferFilters,
} from "@/src/queries/material-transfers";

import { TransferStatusBadge, useTransferSideCan } from "./transfer-parts";

const DIRECTIONS = [
  { value: "all", label: "All" },
  { value: "out", label: "Sent" },
  { value: "in", label: "Received" },
] as const;

const ALL = "all";

function lineSummary(transfer: MaterialTransfer): string {
  const [first, ...rest] = transfer.lines;
  if (first == null) return "";
  const head = `${first.materialName} · ${formatQuantity(first.quantity)} ${first.uomName}`;
  return rest.length === 0 ? head : `${head} +${String(rest.length)} more`;
}

function TransferItem({
  location,
  transfer,
  href,
}: {
  location: StockLocation;
  transfer: MaterialTransfer;
  href: string;
}) {
  const outgoing = sameStockLocation(transfer.from, location);
  const other = outgoing ? transfer.to : transfer.from;
  return (
    <li className="bg-card hover:bg-muted/40 relative rounded-lg border p-3 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <Link
            href={href}
            className="focus-visible:ring-ring block rounded-sm font-medium outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:ring-2"
          >
            {transfer.number}
          </Link>
          <p className="text-muted-foreground flex items-center gap-1 text-sm">
            {outgoing ? (
              <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0" />
            ) : (
              <ArrowDownLeft aria-hidden="true" className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {outgoing ? "To" : "From"} {other.name}
            </span>
          </p>
        </div>
        <TransferStatusBadge status={transfer.status} />
      </div>
      <p className="mt-1 truncate text-sm">{lineSummary(transfer)}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">
        {formatDate(transfer.transferDate)} · Sent by{" "}
        {transfer.createdBy.name ?? "a former member"}
        {transfer.deliveredBy != null &&
          ` · Received by ${transfer.deliveredBy.name ?? "a former member"}`}
      </p>
    </li>
  );
}

function Transfers({
  location,
  filters,
  hrefFor,
  newHref,
  onPage,
}: {
  location: StockLocation;
  filters: TransferFilters;
  hrefFor: (id: string) => string;
  newHref: string | null;
  onPage: (cursor: TransferFilters["cursor"]) => void;
}) {
  const { data } = useSuspenseQuery(transfersQuery(location, filters));
  const filtered =
    filters.direction != null ||
    filters.status != null ||
    (filters.from ?? "") !== "" ||
    (filters.to ?? "") !== "";
  if (data.items.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ArrowLeftRight />
          </EmptyMedia>
          <EmptyTitle>
            {filtered ? "No transfers match" : "No material transfers yet"}
          </EmptyTitle>
          <EmptyDescription>
            {filtered
              ? "Try another direction, status or date range."
              : "Material sent to or received from another site or store shows here."}
          </EmptyDescription>
        </EmptyHeader>
        {!filtered && newHref != null && (
          <EmptyContent>
            <Link href={newHref} className={buttonVariants()}>
              <Plus aria-hidden="true" />
              New transfer
            </Link>
          </EmptyContent>
        )}
      </Empty>
    );
  return (
    <div className="space-y-3">
      <p className="text-muted-foreground text-sm">
        {data.total} {data.total === 1 ? "transfer" : "transfers"}
      </p>
      <ul aria-label="Material Transfers" className="grid gap-2 lg:grid-cols-2">
        {data.items.map((transfer) => (
          <TransferItem
            key={transfer.id}
            location={location}
            transfer={transfer}
            href={hrefFor(transfer.id)}
          />
        ))}
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
            Newer
          </Button>
          <Button
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

/**
 * Material Transfers into and out of a Project or Store (CM-507), newest
 * first, by direction, status and transfer date. The Central Store reuses
 * it with a Store's `StockLocation` and its own links.
 */
export function TransfersList({
  location,
  hrefFor,
  newHref,
}: {
  location: StockLocation;
  /** A transfer's detail page. */
  hrefFor: (id: string) => string;
  /** The new transfer page, from this location. */
  newHref: string;
}) {
  const can = useTransferSideCan(location);
  const [filters, setFilters] = useState<TransferFilters>({});
  const change = (next: Partial<TransferFilters>) => {
    setFilters((current) => ({ ...current, ...next, cursor: null }));
  };
  const canCreate = can("create");
  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Material Transfers</h2>
        {canCreate && (
          <Link href={newHref} className={buttonVariants({ size: "sm" })}>
            <Plus aria-hidden="true" />
            New transfer
          </Link>
        )}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
        <ToggleGroup
          aria-label="Direction"
          value={[filters.direction ?? ALL]}
          onValueChange={(value: string[]) => {
            const next = value[0];
            if (next == null) return;
            change({
              direction: next === "in" || next === "out" ? next : null,
            });
          }}
          variant="outline"
          size="sm"
        >
          {DIRECTIONS.map((item) => (
            <ToggleGroupItem key={item.value} value={item.value}>
              {item.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <Select
          items={[
            { value: ALL, label: "Any status" },
            ...TRANSFER_STATUSES.map((value) => ({
              value,
              label: TRANSFER_STATUS_LABELS[value],
            })),
          ]}
          value={filters.status ?? ALL}
          onValueChange={(value) => {
            if (value == null) return;
            change({
              status: value === ALL ? null : (value as TransferStatus),
            });
          }}
        >
          <SelectTrigger aria-label="Status" className="w-full sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent align="start" alignItemWithTrigger={false}>
            <SelectItem value={ALL}>Any status</SelectItem>
            {TRANSFER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {TRANSFER_STATUS_LABELS[value]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="transfers-from" className="text-xs">
              From
            </Label>
            <Input
              id="transfers-from"
              type="date"
              className="h-8 w-36"
              value={filters.from ?? ""}
              onChange={(event) => {
                change({ from: event.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="transfers-to" className="text-xs">
              To
            </Label>
            <Input
              id="transfers-to"
              type="date"
              className="h-8 w-36"
              value={filters.to ?? ""}
              onChange={(event) => {
                change({ to: event.target.value });
              }}
            />
          </div>
        </div>
      </div>
      <Suspense
        fallback={
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        }
      >
        <Transfers
          location={location}
          filters={filters}
          hrefFor={hrefFor}
          newHref={canCreate ? newHref : null}
          onPage={(cursor) => {
            setFilters((current) => ({ ...current, cursor }));
          }}
        />
      </Suspense>
    </div>
  );
}
