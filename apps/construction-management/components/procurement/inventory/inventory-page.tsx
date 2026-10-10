"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  ArrowLeftRight,
  BellRing,
  ChevronDown,
  ClipboardList,
  Download,
  FileSpreadsheet,
  History,
  MoreHorizontal,
  PackageMinus,
  PackageOpen,
  PackageSearch,
  PackageX,
  Ruler,
  Scale,
  ShoppingCart,
  Truck,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge } from "@repo/ui/components/badge";
import { Button, buttonVariants } from "@repo/ui/components/button";
import { Checkbox } from "@repo/ui/components/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui/components/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@repo/ui/components/empty";
import { Input } from "@repo/ui/components/input";
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
import { cn } from "@repo/ui/lib/utils";

import {
  STOCK_STATE_LABELS,
  STOCK_STATES,
  type StockState,
} from "@/src/procurement/domain/inventory-stock-state";
import type { StockLocation } from "@/src/procurement/domain/stock-location";
import {
  inventoryExportUrl,
  inventoryQuery,
  inventorySampleUrl,
  type InventoryRow,
} from "@/src/queries/inventory";
import {
  canIn,
  procurementAccessQuery,
} from "@/src/queries/procurement-access";

import { AdjustStockDialog } from "./adjust-stock-dialog";
import { ImportInventoryDialog } from "./import-inventory-dialog";
import { useInventoryCan } from "./inventory-access";
import { formatQuantity, inventoryPath } from "./inventory-format";
import { StockHistorySheet } from "./stock-history-sheet";
import { StockMovementDialog, type MovementKind } from "./stock-movement-dialog";
import { StockSettingsDialog, type SettingsMode } from "./stock-settings-dialog";

const STATE_BADGE: Record<
  StockState,
  { variant: "secondary" | "outline" | "destructive"; className?: string }
> = {
  in_stock: { variant: "secondary" },
  low_stock: {
    variant: "outline",
    className:
      "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  },
  out_of_stock: { variant: "destructive" },
};

function StateBadge({ state }: { state: StockState }) {
  const style = STATE_BADGE[state];
  return (
    <Badge variant={style.variant} className={style.className}>
      {STOCK_STATE_LABELS[state]}
    </Badge>
  );
}

const ALL = "all";

/** Where Mode B's documents are raised from the stock list (other tickets' forms). */
function materialsLink(
  projectId: string,
  segment: string,
  materialIds: readonly string[],
): string {
  const base = `/app/projects/${encodeURIComponent(projectId)}/materials/${segment}/new`;
  return materialIds.length === 0
    ? base
    : `${base}?materials=${materialIds.map(encodeURIComponent).join(",")}`;
}

type Dialogs =
  | { kind: "movement"; movement: MovementKind; materialIds: string[] }
  | { kind: "adjust"; row: InventoryRow }
  | { kind: "settings"; row: InventoryRow; mode: SettingsMode }
  | { kind: "history"; row: InventoryRow }
  | { kind: "import" };

/**
 * Current Inventory of a Project or Store (CM-506): stock per material
 * from the ledger with estimate, in transit, minimum and state; Consume,
 * Missing, Adjust stock, Estimation Qty, minimum and alert, history,
 * Import Inventory Stock, Export Data and the Stock Register. On a
 * Project, chosen materials go on to a Purchase Request, Purchase Order or
 * Material Transfer. Works for a Store too (the Central Store reuses it).
 */
export function InventoryPage({
  location,
  registerHref,
}: {
  location: StockLocation;
  /** The Stock Register page; a Project's by default. */
  registerHref?: string;
}) {
  const { data } = useSuspenseQuery(inventoryQuery(location));
  const can = useInventoryCan(location);
  const projectId = location.kind === "project" ? location.id : null;
  const { data: access } = useSuspenseQuery(procurementAccessQuery(projectId));
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>(ALL);
  const [state, setState] = useState<StockState | typeof ALL>(ALL);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const close = () => {
    setDialog(null);
  };

  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const row of data.items)
      if (row.categoryId != null && row.categoryName != null)
        seen.set(row.categoryId, row.categoryName);
    return [...seen].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.items]);

  const rows = data.items.filter((row) => {
    if (category !== ALL && row.categoryId !== category) return false;
    if (state !== ALL && row.state !== state) return false;
    const text = search.trim().toLowerCase();
    return text === "" || row.materialName.toLowerCase().includes(text);
  });
  const filtered = search.trim() !== "" || category !== ALL || state !== ALL;
  const stockHints = useMemo(
    () =>
      new Map(
        data.items.map((row) => [
          row.materialId,
          { inStock: row.inStock, uomName: row.uomName },
        ]),
      ),
    [data.items],
  );
  const chosen = [...selected].filter((id) =>
    data.items.some((row) => row.materialId === id),
  );

  const canCreate = can("create");
  const canUpdate = can("update");
  const canDelete = can("delete");
  const canExport = can("print");
  const canReport = can("report");
  const raise = (menu: Parameters<typeof canIn>[1]) =>
    projectId != null && canIn(access, menu, "create");
  const register = registerHref ?? inventoryPath(location, "register");
  const exportFilters = {
    categoryId: category === ALL ? null : category,
    state: state === ALL ? null : state,
    search,
  };

  const toggle = (id: string, on: boolean) => {
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const rowActions = (row: InventoryRow) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Actions for ${row.materialName}`}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => {
            setDialog({ kind: "history", row });
          }}
        >
          <History aria-hidden="true" />
          History
        </DropdownMenuItem>
        {canCreate && (
          <>
            <DropdownMenuItem
              onClick={() => {
                setDialog({
                  kind: "movement",
                  movement: "consumed",
                  materialIds: [row.materialId],
                });
              }}
            >
              <PackageMinus aria-hidden="true" />
              Consume Material
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setDialog({
                  kind: "movement",
                  movement: "missing",
                  materialIds: [row.materialId],
                });
              }}
            >
              <PackageX aria-hidden="true" />
              Missing Material
            </DropdownMenuItem>
          </>
        )}
        {canUpdate && (
          <>
            <DropdownMenuItem
              onClick={() => {
                setDialog({ kind: "adjust", row });
              }}
            >
              <Scale aria-hidden="true" />
              Adjust stock
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setDialog({ kind: "settings", row, mode: "estimate" });
              }}
            >
              <Ruler aria-hidden="true" />
              Update Estimation Qty
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                setDialog({ kind: "settings", row, mode: "minimum" });
              }}
            >
              <BellRing aria-hidden="true" />
              Minimum stock and alert
            </DropdownMenuItem>
          </>
        )}
        {projectId != null &&
          (raise("procurement.purchase_requests") ||
            raise("procurement.material_transfers")) && (
            <DropdownMenuSeparator />
          )}
        {projectId != null && raise("procurement.purchase_requests") && (
          <DropdownMenuItem
            render={
              <Link
                href={materialsLink(projectId, "purchase-requests", [
                  row.materialId,
                ])}
              />
            }
          >
            <ClipboardList aria-hidden="true" />
            Raise a Purchase Request
          </DropdownMenuItem>
        )}
        {projectId != null && raise("procurement.material_transfers") && (
          <DropdownMenuItem
            render={
              <Link
                href={materialsLink(projectId, "transfers", [row.materialId])}
              />
            }
          >
            <ArrowLeftRight aria-hidden="true" />
            Transfer Material
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      {canCreate && (
        <>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setDialog({
                kind: "movement",
                movement: "consumed",
                materialIds: chosen,
              });
            }}
          >
            <PackageMinus aria-hidden="true" />
            Consume
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDialog({
                kind: "movement",
                movement: "missing",
                materialIds: chosen,
              });
            }}
          >
            <PackageX aria-hidden="true" />
            Missing
          </Button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button type="button" size="sm" variant="outline" />}
        >
          More
          <ChevronDown aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {canCreate && (
            <DropdownMenuItem
              onClick={() => {
                setDialog({ kind: "import" });
              }}
            >
              <Upload aria-hidden="true" />
              Import Inventory Stock
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            render={<a href={inventorySampleUrl(location)} download />}
          >
            <FileSpreadsheet aria-hidden="true" />
            Export Sample Excel
          </DropdownMenuItem>
          {canExport && (
            <DropdownMenuItem
              render={
                <a href={inventoryExportUrl(location, exportFilters)} download />
              }
            >
              <Download aria-hidden="true" />
              Export Data
            </DropdownMenuItem>
          )}
          {canReport && register !== "" && (
            <DropdownMenuItem render={<Link href={register} />}>
              <ClipboardList aria-hidden="true" />
              Stock Register
            </DropdownMenuItem>
          )}
          {projectId != null && raise("procurement.material_received") && (
            <DropdownMenuItem
              render={
                <Link
                  href={`/app/projects/${encodeURIComponent(projectId)}/materials/goods-received/new`}
                />
              }
            >
              <Truck aria-hidden="true" />
              Record a goods receipt
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );

  const summary = data.summary;

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 className="font-semibold">Current Inventory</h2>
          {summary.materials > 0 && (
            <p className="text-muted-foreground text-sm tabular-nums">
              {summary.materials}{" "}
              {summary.materials === 1 ? "material" : "materials"} ·{" "}
              {summary.lowStock} low · {summary.outOfStock} out of stock
            </p>
          )}
        </div>
        {actions}
      </div>

      {data.items.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <PackageOpen />
            </EmptyMedia>
            <EmptyTitle>No stock here yet</EmptyTitle>
            <EmptyDescription>
              Stock comes in with goods receipts, transfers and deliveries
              from a store. To start from today&apos;s count, import the
              opening stock from the sample sheet.
            </EmptyDescription>
          </EmptyHeader>
          {canCreate && (
            <EmptyContent>
              <Button
                type="button"
                onClick={() => {
                  setDialog({ kind: "import" });
                }}
              >
                <Upload aria-hidden="true" />
                Import Inventory Stock
              </Button>
            </EmptyContent>
          )}
        </Empty>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <Input
              type="search"
              aria-label="Search materials"
              placeholder="Search materials"
              className="h-8 sm:w-64"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
            <Select
              items={[
                { value: ALL, label: "All categories" },
                ...categories.map(([value, label]) => ({ value, label })),
              ]}
              value={category}
              onValueChange={(value) => {
                if (value != null) setCategory(value);
              }}
            >
              <SelectTrigger aria-label="Category" className="w-full sm:w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectItem value={ALL}>All categories</SelectItem>
                {categories.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              items={[
                { value: ALL, label: "Any state" },
                ...STOCK_STATES.map((value) => ({
                  value,
                  label: STOCK_STATE_LABELS[value],
                })),
              ]}
              value={state}
              onValueChange={(value) => {
                if (value != null) setState(value);
              }}
            >
              <SelectTrigger aria-label="Stock state" className="w-full sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="start" alignItemWithTrigger={false}>
                <SelectItem value={ALL}>Any state</SelectItem>
                {STOCK_STATES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {STOCK_STATE_LABELS[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {chosen.length > 0 && projectId != null && (
            <div
              role="region"
              aria-label="Selected materials"
              className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2"
            >
              <span className="text-sm font-medium">
                {chosen.length} selected
              </span>
              {raise("procurement.purchase_requests") && (
                <Link
                  href={materialsLink(projectId, "purchase-requests", chosen)}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <ClipboardList aria-hidden="true" />
                  Purchase Request
                </Link>
              )}
              {raise("procurement.purchase_orders") && (
                <Link
                  href={materialsLink(projectId, "purchase-orders", chosen)}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <ShoppingCart aria-hidden="true" />
                  Purchase Order
                </Link>
              )}
              {raise("procurement.material_transfers") && (
                <Link
                  href={materialsLink(projectId, "transfers", chosen)}
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <ArrowLeftRight aria-hidden="true" />
                  Transfer
                </Link>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSelected(new Set());
                }}
              >
                Clear
              </Button>
            </div>
          )}

          {rows.length === 0 ? (
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <PackageSearch />
                </EmptyMedia>
                <EmptyTitle>No materials match</EmptyTitle>
                <EmptyDescription>
                  Try another name, category or state.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <div
                role="region"
                aria-label="Stock table, scrolls sideways"
                tabIndex={0}
                className="focus-visible:ring-ring/50 overflow-x-auto rounded-lg border outline-none focus-visible:ring-3 [&>[data-slot=table-container]]:overflow-visible hidden md:block"
              >
                <Table aria-label="Stock">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <span className="sr-only">Select</span>
                      </TableHead>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Estimated</TableHead>
                      <TableHead className="text-right">In stock</TableHead>
                      <TableHead className="text-right">In transit</TableHead>
                      <TableHead className="text-right">Minimum</TableHead>
                      <TableHead>State</TableHead>
                      <TableHead className="w-12">
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((row) => (
                      <TableRow key={row.materialId}>
                        <TableCell>
                          <Checkbox
                            aria-label={`Select ${row.materialName}`}
                            checked={selected.has(row.materialId)}
                            onCheckedChange={(checked) => {
                              toggle(row.materialId, checked);
                            }}
                          />
                        </TableCell>
                        <TableCell className="max-w-72">
                          <Button
                            type="button"
                            variant="link"
                            className="text-foreground block h-auto max-w-full truncate p-0 text-left font-medium"
                            title={row.materialName}
                            onClick={() => {
                              setDialog({ kind: "history", row });
                            }}
                          >
                            {row.materialName}
                          </Button>
                          <span className="text-muted-foreground block text-xs">
                            {row.categoryName ?? "No category"} · {row.uomName}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatQuantity(row.estimatedQty)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatQuantity(row.inStock)}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                          <TransitFigures row={row} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          <span className="inline-flex items-center gap-1">
                            {row.alertEnabled && (
                              <BellRing
                                aria-label="Alert on"
                                className="text-muted-foreground size-3.5"
                              />
                            )}
                            {formatQuantity(row.minimum)}
                          </span>
                        </TableCell>
                        <TableCell>
                          <StateBadge state={row.state} />
                        </TableCell>
                        <TableCell>{rowActions(row)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <ul aria-label="Stock" className="space-y-2 md:hidden">
                {rows.map((row) => (
                  <li
                    key={row.materialId}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <Checkbox
                      className="mt-1"
                      aria-label={`Select ${row.materialName}`}
                      checked={selected.has(row.materialId)}
                      onCheckedChange={(checked) => {
                        toggle(row.materialId, checked);
                      }}
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <Button
                          type="button"
                          variant="link"
                          className="text-foreground h-auto min-w-0 truncate p-0 text-left font-medium"
                          onClick={() => {
                            setDialog({ kind: "history", row });
                          }}
                        >
                          {row.materialName}
                        </Button>
                        <StateBadge state={row.state} />
                      </div>
                      <p className="text-sm tabular-nums">
                        <span className="font-semibold">
                          {formatQuantity(row.inStock)}
                        </span>{" "}
                        {row.uomName} in stock
                        {row.estimatedQty != null &&
                          ` · of ${formatQuantity(row.estimatedQty)} estimated`}
                      </p>
                      <p className="text-muted-foreground text-xs tabular-nums">
                        <TransitFigures row={row} /> · Minimum{" "}
                        {formatQuantity(row.minimum)}
                        {row.alertEnabled && (
                          <BellRing
                            aria-label="Alert on"
                            className="ml-1 inline size-3"
                          />
                        )}
                      </p>
                    </div>
                    {rowActions(row)}
                  </li>
                ))}
              </ul>
              {filtered && (
                <p className="text-muted-foreground text-xs">
                  Showing {rows.length} of {data.items.length}
                </p>
              )}
            </>
          )}
        </>
      )}

      <StockMovementDialog
        location={location}
        kind={dialog?.kind === "movement" ? dialog.movement : null}
        materialIds={dialog?.kind === "movement" ? dialog.materialIds : []}
        stock={stockHints}
        onClose={close}
      />
      <AdjustStockDialog
        location={location}
        row={dialog?.kind === "adjust" ? dialog.row : null}
        onClose={close}
      />
      <StockSettingsDialog
        location={location}
        target={
          dialog?.kind === "settings"
            ? { row: dialog.row, mode: dialog.mode }
            : null
        }
        onClose={close}
      />
      <StockHistorySheet
        location={location}
        row={dialog?.kind === "history" ? dialog.row : null}
        canUpdate={canUpdate}
        canDelete={canDelete}
        onClose={close}
      />
      <ImportInventoryDialog
        location={location}
        open={dialog?.kind === "import"}
        onClose={close}
      />
    </div>
  );
}

function TransitFigures({ row }: { row: InventoryRow }) {
  const inbound = Number(row.inTransitIn) > 0;
  const outbound = Number(row.inTransitOut) > 0;
  if (!inbound && !outbound) return <span>—</span>;
  return (
    <span className={cn("inline-flex flex-wrap justify-end gap-x-2")}>
      {inbound && <span>+{formatQuantity(row.inTransitIn)} in</span>}
      {outbound && <span>−{formatQuantity(row.inTransitOut)} out</span>}
    </span>
  );
}
