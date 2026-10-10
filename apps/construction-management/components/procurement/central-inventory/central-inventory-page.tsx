"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { Download, Package } from "lucide-react";
import { Suspense, useState, useTransition } from "react";
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

import { PageHeader } from "@/components/app-shell/page-header";
import {
  CENTRAL_STORE_PATH,
  formatQuantity,
  ScrollRegion,
  NamedMultiSelect,
  StockStateBadge,
} from "@/components/procurement/stores/central-store-parts";
import {
  centralInventoryQuery,
  locationKey,
  STOCK_STATE_LABELS,
  stockLedgerQuery,
  stockLedgerXlsxUrl,
  type CentralInventory,
  type StockLedgerFilter,
  type StockState,
} from "@/src/queries/central-inventory";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";

const ALL = "all";

/** Movement columns of the Stock Ledger, in ledger order. */
const MOVEMENTS = [
  ["opening", "Opening stock"],
  ["received", "Received"],
  ["transferred_in", "Transferred in"],
  ["transferred_out", "Transferred out"],
  ["issued", "Issued"],
  ["received_from_store", "Received from store"],
  ["consumed", "Consumed"],
  ["missing", "Missing"],
  ["adjustment", "Adjustment"],
] as const;

function today(): string {
  return new Date().toLocaleDateString("en-CA");
}

const loading = <p className="text-muted-foreground text-sm">Loading…</p>;

function FilterSelect({
  id,
  label,
  value,
  onChange,
  items,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: { value: string; label: string }[];
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select
        items={items}
        value={value}
        onValueChange={(next) => {
          if (next != null) onChange(next);
        }}
      >
        <SelectTrigger id={id} size="lg" className="w-full min-w-0">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="start"
          alignItemWithTrigger={false}
          aria-label={label}
        >
          {items.map((item) => (
            <SelectItem key={item.value} value={item.value}>
              {item.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function Positions({ data }: { data: CentralInventory }) {
  if (data.materials.length === 0)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Package />
          </EmptyMedia>
          <EmptyTitle>No stock matches</EmptyTitle>
          <EmptyDescription>
            Stock shows here once Goods Receipts, transfers or opening stock are
            recorded at a Project or Store.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <>
      <h2 className="sr-only">Stock by material</h2>
      <ul aria-label="Materials" className="space-y-3">
        {data.materials.map((material) => (
          <li
            key={material.materialId}
            className="bg-card space-y-2 rounded-xl border p-3"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-semibold">
                  {material.materialName}
                </h3>
                {material.categoryName == null ? null : (
                  <p className="text-muted-foreground text-xs">
                    {material.categoryName}
                  </p>
                )}
              </div>
              <p className="text-sm tabular-nums">
                <span className="font-semibold">
                  {formatQuantity(material.totalStock)} {material.uomName}
                </span>
                {Number(material.totalInTransit) > 0 ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · {formatQuantity(material.totalInTransit)} in transit
                  </span>
                ) : null}
              </p>
            </div>
            <ScrollRegion
              bordered={false}
              label={`Stock of ${material.materialName}, scrolls sideways`}
            >
              <Table aria-label={`Stock of ${material.materialName}`}>
                <TableHeader>
                  <TableRow>
                    <TableHead>Location</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead className="text-right">In transit</TableHead>
                    <TableHead>State</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {material.positions.map((position) => (
                    <TableRow key={locationKey(position.location)}>
                      <TableCell className="min-w-32">
                        {position.location.name}
                        <span className="text-muted-foreground ml-1 text-xs">
                          {position.location.kind === "store"
                            ? "Store"
                            : "Project"}
                        </span>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(position.stock)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatQuantity(position.inTransit)}
                      </TableCell>
                      <TableCell>
                        <StockStateBadge state={position.state} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollRegion>
          </li>
        ))}
      </ul>
    </>
  );
}

function Ledger({ filter }: { filter: StockLedgerFilter }) {
  const { data } = useSuspenseQuery(stockLedgerQuery(filter));
  if (data.rows.length === 0)
    return (
      <p className="text-muted-foreground text-sm">
        No stock movements in this period.
      </p>
    );
  return (
    <ScrollRegion label="Stock Ledger, scrolls sideways">
      <Table aria-label="Stock Ledger">
        <TableHeader>
          <TableRow>
            <TableHead>Location</TableHead>
            <TableHead>Material</TableHead>
            {MOVEMENTS.map(([, label]) => (
              <TableHead key={label} className="text-right">
                {label}
              </TableHead>
            ))}
            <TableHead className="text-right">Closing stock</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.rows.map((row) => (
            <TableRow key={`${locationKey(row.location)}:${row.materialId}`}>
              <TableCell className="min-w-32">{row.location.name}</TableCell>
              <TableCell className="min-w-40">
                {row.materialName}
                <span className="text-muted-foreground ml-1 text-xs">
                  {row.uomName}
                </span>
              </TableCell>
              {MOVEMENTS.map(([type]) => (
                <TableCell key={type} className="text-right tabular-nums">
                  {formatQuantity(
                    type === "opening" ? row.opening : row.movements[type],
                  )}
                </TableCell>
              ))}
              <TableCell className="text-right font-medium tabular-nums">
                {formatQuantity(row.closing)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </ScrollRegion>
  );
}

/**
 * Workspace → Central Inventory (CM-509): stock per material at every
 * Project and Store with what is in transit, filtered by location,
 * category and stock state; and the Stock Ledger for a period, on screen
 * and as an Excel file (Central Inventory print).
 */
export function CentralInventoryPage() {
  // Filter changes keep the current list on screen while the next loads.
  const [, startTransition] = useTransition();
  const [locations, setLocationsNow] = useState<string[]>([]);
  const [categoryId, setCategoryNow] = useState(ALL);
  const [state, setStateNow] = useState(ALL);
  const setLocations = (next: string[]) => {
    startTransition(() => {
      setLocationsNow(next);
    });
  };
  const setCategoryId = (next: string) => {
    startTransition(() => {
      setCategoryNow(next);
    });
  };
  const setState = (next: string) => {
    startTransition(() => {
      setStateNow(next);
    });
  };
  const { data } = useSuspenseQuery(
    centralInventoryQuery({
      locations,
      categoryId: categoryId === ALL ? null : categoryId,
      state: state === ALL ? null : (state as StockState),
    }),
  );
  const access = useQuery(procurementAccessQuery(null)).data;
  const canDownload =
    access != null && canIn(access, "procurement.central_inventory", "print");
  const [from, setFrom] = useState(`${today().slice(0, 8)}01`);
  const [to, setTo] = useState(today());
  const [shown, setShown] = useState<StockLedgerFilter | null>(null);
  const ledgerFilter: StockLedgerFilter = {
    from,
    to,
    locations,
    categoryId: categoryId === ALL ? null : categoryId,
  };
  const locationItems = data.locations.map((location) => ({
    id: locationKey(location),
    name: `${location.name} (${location.kind === "store" ? "Store" : "Project"})`,
  }));

  return (
    <div className="w-full p-6">
      <div className="w-full max-w-5xl space-y-6">
        <PageHeader
          back={{ label: "Central Store", href: CENTRAL_STORE_PATH }}
          title="Central Inventory"
          meta="Stock across every Project and Store."
        />
        <section aria-label="Filters" className="grid gap-4 sm:grid-cols-3">
          <div className="min-w-0 space-y-1.5 sm:col-span-3">
            <Label htmlFor="inventory-locations">Locations</Label>
            <NamedMultiSelect
              id="inventory-locations"
              label="Locations"
              items={locationItems}
              value={locations}
              onChange={setLocations}
              placeholder="Every Project and Store"
            />
          </div>
          <FilterSelect
            id="inventory-category"
            label="Category"
            value={categoryId}
            onChange={setCategoryId}
            items={[
              { value: ALL, label: "All categories" },
              ...data.categories.map((category) => ({
                value: category.id,
                label: category.name,
              })),
            ]}
          />
          <FilterSelect
            id="inventory-state"
            label="Stock state"
            value={state}
            onChange={setState}
            items={[
              { value: ALL, label: "Any state" },
              ...(
                Object.entries(STOCK_STATE_LABELS) as [StockState, string][]
              ).map(([value, label]) => ({ value, label })),
            ]}
          />
        </section>

        <Positions data={data} />

        <section className="space-y-4">
          <h2 className="font-semibold">Stock Ledger</h2>
          <div className="grid gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="ledger-from">From</Label>
              <Input
                id="ledger-from"
                type="date"
                className="h-10"
                value={from}
                max={to}
                onChange={(event) => {
                  setFrom(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ledger-to">To</Label>
              <Input
                id="ledger-to"
                type="date"
                className="h-10"
                value={to}
                min={from}
                onChange={(event) => {
                  setTo(event.target.value);
                }}
              />
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={from === "" || to === "" || from > to}
              onClick={() => {
                setShown(ledgerFilter);
              }}
            >
              Show ledger
            </Button>
            {canDownload ? (
              <a
                href={stockLedgerXlsxUrl(ledgerFilter)}
                className={buttonVariants({ variant: "outline" })}
                download
              >
                <Download aria-hidden="true" />
                Excel
              </a>
            ) : null}
          </div>
          <p className="text-muted-foreground text-sm">
            Opening stock, each movement and closing stock per material for the
            chosen locations and category.
          </p>
          {shown == null ? null : (
            <Suspense fallback={loading}>
              <Ledger filter={shown} />
            </Suspense>
          )}
        </section>
      </div>
    </div>
  );
}
