import { queryOptions } from "@tanstack/react-query";

import type {
  GetConstructionProcurementCentralInventoryResponseModel,
  GetConstructionProcurementStockLedgerResponseModel,
} from "@/app/api/construction/procurement/central-inventory/central-inventory-models";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";

export type CentralInventory =
  GetConstructionProcurementCentralInventoryResponseModel;
export type InventoryMaterial = CentralInventory["materials"][number];
export type InventoryLocation = CentralInventory["locations"][number];
export type StockState = InventoryMaterial["positions"][number]["state"];
export type StockLedger = GetConstructionProcurementStockLedgerResponseModel;

export const CENTRAL_INVENTORY_API = `${PROCUREMENT_API}/central-inventory`;
export const CENTRAL_INVENTORY_KEY = [
  ...PROCUREMENT_KEY,
  "central-inventory",
] as const;

/** The stock-state labels of the one rule (`inventory-stock-state`). */
export { STOCK_STATE_LABELS } from "@/src/procurement/domain/inventory-stock-state";

/** `project:<id>` / `store:<id>`. */
export function locationKey(location: { kind: string; id: string }): string {
  return `${location.kind}:${location.id}`;
}

export type CentralInventoryFilter = {
  /** `locationKey`s; empty for every location. */
  locations: readonly string[];
  categoryId: string | null;
  state: StockState | null;
};

function filterQuery(filter: {
  locations: readonly string[];
  categoryId: string | null;
}): URLSearchParams {
  const query = new URLSearchParams();
  if (filter.locations.length > 0)
    query.set("locations", filter.locations.join(","));
  if (filter.categoryId != null) query.set("categoryId", filter.categoryId);
  return query;
}

export function centralInventoryQuery(filter: CentralInventoryFilter) {
  const query = filterQuery(filter);
  if (filter.state != null) query.set("state", filter.state);
  const search = query.toString();
  return queryOptions({
    queryKey: [...CENTRAL_INVENTORY_KEY, "positions", search] as const,
    queryFn: () =>
      apiJson<CentralInventory>(
        `${CENTRAL_INVENTORY_API}${search === "" ? "" : `?${search}`}`,
      ),
  });
}

export type StockLedgerFilter = {
  from: string;
  to: string;
  locations: readonly string[];
  categoryId: string | null;
};

function ledgerSearch(filter: StockLedgerFilter): string {
  const query = filterQuery(filter);
  query.set("from", filter.from);
  query.set("to", filter.to);
  return query.toString();
}

export function stockLedgerQuery(filter: StockLedgerFilter) {
  const search = ledgerSearch(filter);
  return queryOptions({
    queryKey: [...CENTRAL_INVENTORY_KEY, "ledger", search] as const,
    queryFn: () =>
      apiJson<StockLedger>(`${CENTRAL_INVENTORY_API}/stock-ledger?${search}`),
  });
}

/** The Excel download, generated on request. */
export function stockLedgerXlsxUrl(filter: StockLedgerFilter): string {
  return `${CENTRAL_INVENTORY_API}/stock-ledger/xlsx?${ledgerSearch(filter)}`;
}

/** `12.500` as `12.5`, Indian digit grouping for the whole part. */
export function formatQuantity(decimal: string): string {
  const negative = decimal.startsWith("-");
  const [whole = "0", fraction = ""] = (
    negative ? decimal.slice(1) : decimal
  ).split(".");
  const trimmed = fraction.replace(/0+$/, "");
  const grouped = new Intl.NumberFormat("en-IN").format(BigInt(whole));
  return `${negative ? "−" : ""}${grouped}${trimmed === "" ? "" : `.${trimmed}`}`;
}
