"use client";

import { ClockCounterClockwiseIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useDeferredValue, useMemo, useState } from "react";
import { Button } from "@repo/ui/components/button";
import { EmptyState } from "@repo/ui/components/empty-state";
import { Input } from "@repo/ui/components/input";
import { Label } from "@repo/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@repo/ui/components/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table";
import { TableCard } from "@/app/(app)/preschool/_components/table-card";
import { cn } from "@repo/ui/lib/utils";

import { feeDateLabel } from "@/lib/preschool-fees";
import { formatQuantityDelta, stockCounterparty } from "@/lib/preschool-stock";
import {
  STOCK_MOVEMENT_KIND_LABELS,
  stockLedgerQueryOptions,
  type PreschoolStockLedger,
  type PreschoolStockMovementKind,
} from "@/src/queries/preschool/stock";

const PAGE_SIZE = 25;
const ALL = "all";

/** Movements as a table; with one item, the balance after each. */
export function StockLedgerTable({
  ledger,
  showItem,
}: {
  ledger: PreschoolStockLedger;
  showItem: boolean;
}) {
  if (ledger.total === 0)
    return (
      <EmptyState
        className="border"
        size="md"
        icon={ClockCounterClockwiseIcon}
        tone="orange"
        title="No movements"
        description="Stock received, issued, adjusted and transferred shows here."
      />
    );
  const balance = ledger.items.some((row) => row.balanceAfter != null);
  return (
    <TableCard>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            {showItem ? <TableHead>Item</TableHead> : null}
            <TableHead>Movement</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            {balance ? (
              <TableHead className="text-right">Balance</TableHead>
            ) : null}
            <TableHead className="hidden md:table-cell">By</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ledger.items.map((row) => {
            const who = stockCounterparty(row);
            return (
              <TableRow key={row.id}>
                <TableCell className="whitespace-nowrap">
                  {feeDateLabel(row.movedOn)}
                </TableCell>
                {showItem ? <TableCell>{row.itemName}</TableCell> : null}
                <TableCell>
                  <div>{STOCK_MOVEMENT_KIND_LABELS[row.kind]}</div>
                  {who == null && row.note == null ? null : (
                    <div className="text-muted-foreground text-xs">
                      {[who, row.note].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right whitespace-nowrap tabular-nums",
                    row.quantityDelta < 0 && "text-destructive",
                  )}
                >
                  {formatQuantityDelta(row.quantityDelta)} {row.unit}
                </TableCell>
                {balance ? (
                  <TableCell className="text-right tabular-nums">
                    {row.balanceAfter}
                  </TableCell>
                ) : null}
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {row.recordedByName}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </TableCard>
  );
}

const KIND_ITEMS = [
  { value: ALL, label: "Every movement" },
  ...(
    Object.entries(STOCK_MOVEMENT_KIND_LABELS) as [
      PreschoolStockMovementKind,
      string,
    ][]
  ).map(([value, label]) => ({ value, label })),
];

/** A Centre's ledger with filters (item, kind, dates) and paging. */
export function StockLedger({
  centreId,
  itemId,
  items,
}: {
  centreId: string;
  /** Fixed to one item: no item filter, and a running balance. */
  itemId?: string;
  /** Items for the filter when `itemId` is not fixed. */
  items?: readonly { itemId: string; name: string }[];
}) {
  const [itemFilter, setItemFilter] = useState(ALL);
  const [kind, setKind] = useState(ALL);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [cursors, setCursors] = useState<string[]>([]);
  const chosenItem = itemId ?? (itemFilter === ALL ? undefined : itemFilter);
  const cursor = cursors.at(-1);
  const filters = useDeferredValue(
    useMemo(
      () => ({
        centreId,
        ...(chosenItem == null ? {} : { itemId: chosenItem }),
        ...(kind === ALL ? {} : { kind: kind as PreschoolStockMovementKind }),
        ...(from === "" ? {} : { from }),
        ...(to === "" ? {} : { to }),
        limit: PAGE_SIZE,
        ...(cursor == null ? {} : { cursor }),
      }),
      [centreId, chosenItem, kind, from, to, cursor],
    ),
  );
  const { data } = useSuspenseQuery(stockLedgerQueryOptions(filters));
  const itemItems = [
    { value: ALL, label: "Every item" },
    ...(items ?? []).map((item) => ({ value: item.itemId, label: item.name })),
  ];
  const reset = () => {
    setCursors([]);
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        {itemId == null ? (
          <div className="space-y-1.5">
            <Label htmlFor="ledger-item">Item</Label>
            <Select
              items={itemItems}
              value={itemFilter}
              onValueChange={(value) => {
                if (value != null) {
                  setItemFilter(value);
                  reset();
                }
              }}
            >
              <SelectTrigger id="ledger-item" className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {itemItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="ledger-kind">Movement</Label>
          <Select
            items={KIND_ITEMS}
            value={kind}
            onValueChange={(value) => {
              if (value != null) {
                setKind(value);
                reset();
              }
            }}
          >
            <SelectTrigger id="ledger-kind" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {KIND_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ledger-from">From</Label>
          <Input
            id="ledger-from"
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              reset();
            }}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ledger-to">To</Label>
          <Input
            id="ledger-to"
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              reset();
            }}
          />
        </div>
      </div>
      <StockLedgerTable ledger={data} showItem={itemId == null} />
      {data.total > PAGE_SIZE ? (
        <div className="flex items-center justify-end gap-2">
          <span className="text-muted-foreground text-sm">
            Page {cursors.length + 1} of {Math.ceil(data.total / PAGE_SIZE)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={cursors.length === 0}
            onClick={() => {
              setCursors((previous) => previous.slice(0, -1));
            }}
          >
            <ChevronLeft aria-hidden="true" />
            Previous
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={data.nextCursor == null}
            onClick={() => {
              const next = data.nextCursor;
              if (next != null) setCursors((previous) => [...previous, next]);
            }}
          >
            Next
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
