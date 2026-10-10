import { z } from "zod";

import type {
  CentralInventory,
  StockLedgerReport,
} from "@/src/procurement/application/central-inventory-queries";
import { STOCK_STATES } from "@/src/procurement/domain/central-inventory";
import { STOCK_ENTRY_TYPES } from "@/src/procurement/domain/stock-ledger";
import type { StockLocation } from "@/src/procurement/domain/stock-location";

import { DomainError } from "@/src/shared-kernel/domain-error";

import { NamedModel, quantityString } from "../stores/store-models";

export const CENTRAL_INVENTORY_PATH =
  "/api/construction/procurement/central-inventory";

const LOCATION_RE =
  /^(project|store):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `project:<uuid>,store:<uuid>`: only these locations (every one when absent). */
const locationsQuery = z
  .string()
  .max(10_000)
  .regex(
    /^\s*((project|store):[0-9a-fA-F-]{36})(\s*,\s*(project|store):[0-9a-fA-F-]{36})*\s*$/,
    "Locations are kind:id pairs (project:<uuid> or store:<uuid>).",
  )
  .optional();

/** The `locations` query as stock locations (undefined: every one). */
export function parseLocations(
  raw: string | undefined,
): StockLocation[] | undefined {
  if (raw == null || raw.trim() === "") return undefined;
  const parts = raw.split(",").map((part) => part.trim().toLowerCase());
  const bad = parts.filter((part) => !LOCATION_RE.test(part));
  if (bad.length > 0)
    throw new DomainError(
      "STOCK_LOCATION_INVALID",
      "Choose a Project or a Store.",
      {
        details: { field: "locations" },
      },
    );
  return [...new Set(parts)].map((part) => {
    const [kind, id] = part.split(":") as ["project" | "store", string];
    return { kind, id };
  });
}

export const GetConstructionProcurementCentralInventoryRequestModel = z.object({
  locations: locationsQuery,
  categoryId: z.uuid().optional(),
  state: z.enum(STOCK_STATES).optional(),
  /** Part of the material name. */
  search: z.string().max(200).optional(),
});

export const GetConstructionProcurementStockLedgerRequestModel = z
  .object({
    from: z.iso.date(),
    to: z.iso.date(),
    locations: locationsQuery,
    categoryId: z.uuid().optional(),
    search: z.string().max(200).optional(),
  })
  .refine((value) => value.from <= value.to, {
    message: "from must be on or before to.",
    path: ["from"],
  });

const LocationModel = z.object({
  kind: z.enum(["project", "store"]),
  id: z.uuid(),
  name: z.string(),
});

export const GetConstructionProcurementCentralInventoryResponseModel = z.object(
  {
    /** Every live Project and Store, for the location filter. */
    locations: z.array(LocationModel),
    categories: z.array(NamedModel),
    materials: z.array(
      z.object({
        materialId: z.uuid(),
        materialName: z.string(),
        uomName: z.string(),
        categoryId: z.uuid().nullable(),
        categoryName: z.string().nullable(),
        totalStock: quantityString,
        totalInTransit: quantityString,
        positions: z.array(
          z.object({
            location: LocationModel,
            stock: quantityString,
            /** Dispatched to this location, not yet delivered. */
            inTransit: quantityString,
            minimum: quantityString.nullable(),
            state: z.enum(STOCK_STATES),
          }),
        ),
      }),
    ),
  },
);
export type GetConstructionProcurementCentralInventoryResponseModel = z.infer<
  typeof GetConstructionProcurementCentralInventoryResponseModel
>;

export const GetConstructionProcurementStockLedgerResponseModel = z.object({
  from: z.iso.date(),
  to: z.iso.date(),
  rows: z.array(
    z.object({
      location: LocationModel,
      materialId: z.uuid(),
      materialName: z.string(),
      uomName: z.string(),
      categoryName: z.string().nullable(),
      opening: quantityString,
      /** Net quantity per entry type in the period (out-types negative). */
      movements: z.record(z.enum(STOCK_ENTRY_TYPES), quantityString),
      closing: quantityString,
    }),
  ),
});
export type GetConstructionProcurementStockLedgerResponseModel = z.infer<
  typeof GetConstructionProcurementStockLedgerResponseModel
>;

type Located = { kind: "project" | "store"; id: string; name: string };

function locationOut(location: Located) {
  return { kind: location.kind, id: location.id, name: location.name };
}

/** Field by field, so nothing of the read model leaks into the response. */
export function toCentralInventoryResponse(
  inventory: CentralInventory,
): GetConstructionProcurementCentralInventoryResponseModel {
  return {
    locations: inventory.locations.map(locationOut),
    categories: inventory.categories.map((category) => ({
      id: category.id,
      name: category.name,
    })),
    materials: inventory.materials.map((material) => ({
      materialId: material.materialId,
      materialName: material.materialName,
      uomName: material.uomName,
      categoryId: material.categoryId,
      categoryName: material.categoryName,
      totalStock: material.totalStock,
      totalInTransit: material.totalInTransit,
      positions: material.positions.map((position) => ({
        location: locationOut(position.location),
        stock: position.stock,
        inTransit: position.inTransit,
        minimum: position.minimum,
        state: position.state,
      })),
    })),
  };
}

export function toStockLedgerResponse(
  report: StockLedgerReport,
): GetConstructionProcurementStockLedgerResponseModel {
  return {
    from: report.from,
    to: report.to,
    rows: report.rows.map((row) => ({
      location: locationOut(row.location),
      materialId: row.materialId,
      materialName: row.materialName,
      uomName: row.uomName,
      categoryName: row.categoryName,
      opening: row.opening,
      movements: { ...row.movements },
      closing: row.closing,
    })),
  };
}
