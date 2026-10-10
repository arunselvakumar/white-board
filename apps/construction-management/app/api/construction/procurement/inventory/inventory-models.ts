import { z } from "zod";

import { STOCK_STATES } from "@/src/procurement/domain/inventory-stock-state";
import {
  STOCK_ENTRY_TYPES,
  type StockSourceType,
} from "@/src/procurement/domain/stock-ledger";
import { STOCK_MOVEMENT_KINDS } from "@/src/procurement/domain/stock-movement";
import type {
  HistoryEntry,
  InventoryList,
  InventoryRow,
  StockRegisterRow,
} from "@/src/procurement/infrastructure/inventory-queries";
import type {
  ImportResult,
  StockMovement,
} from "@/src/procurement/infrastructure/stock-movement-store";

export const INVENTORY_PATH = "/api/construction/procurement/inventory";

/** A decimal string with at most 3 decimals (`12.5`); checked by the command (`QUANTITY_INVALID`). */
const quantityInput = z.string().trim().min(1).max(24);
/** As returned: `12.500`; signed where it may be negative. */
const quantity = z.string();

const STOCK_SOURCE_TYPES = [
  "goods_receipt",
  "material_transfer",
  "delivery_note",
  "stock_movement",
] as const satisfies readonly StockSourceType[];

/** Where stock is held: a Project or a Central Store. */
export const ConstructionProcurementStockLocationModel = z.object({
  kind: z.enum(["project", "store"]),
  id: z.uuid(),
});

/** The location in a query string. */
const locationQuery = {
  locationKind: z.enum(["project", "store"]),
  locationId: z.uuid(),
};

/** A place inside a Project (CM-403): a Wing with Floors and Units, an Amenity, a Common Development or a Location. */
export const ConstructionProcurementSiteLocationModel = z.discriminatedUnion(
  "type",
  [
    z.object({
      type: z.literal("wing"),
      wingId: z.uuid(),
      floorIds: z.array(z.uuid()).max(200).readonly(),
      unitIds: z.array(z.uuid()).max(5000).readonly(),
    }),
    z.object({ type: z.literal("amenity"), developmentId: z.uuid() }),
    z.object({
      type: z.literal("common_development"),
      developmentId: z.uuid(),
    }),
    z.object({ type: z.literal("location"), locationId: z.uuid() }),
  ],
);

// Requests

export const ListConstructionProcurementInventoryRequestModel = z.object({
  ...locationQuery,
  categoryId: z.uuid().optional(),
  state: z.enum(STOCK_STATES).optional(),
  /** Material name contains, ignoring case. */
  search: z.string().trim().max(120).optional(),
});

export const ExportConstructionProcurementInventoryRequestModel =
  ListConstructionProcurementInventoryRequestModel;

export const SampleConstructionProcurementInventoryRequestModel = z.object(
  locationQuery,
);

export const ImportConstructionProcurementInventoryRequestModel = z.object({
  ...locationQuery,
  /** `true` (default) previews; `false` posts all rows or none. */
  dryRun: z.enum(["true", "false"]).optional(),
  /** The Opening entries' date; today when left out. */
  openingDate: z.iso.date().optional(),
});

export const GetConstructionProcurementInventoryHistoryRequestModel = z
  .object({
    ...locationQuery,
    materialId: z.uuid(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).optional(),
    before: z.string().min(1).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const GetConstructionProcurementStockRegisterRequestModel = z.object({
  ...locationQuery,
  from: z.iso.date(),
  to: z.iso.date(),
});

export const UpdateConstructionProcurementStockSettingsRequestModel = z.object({
  location: ConstructionProcurementStockLocationModel,
  materialId: z.uuid(),
  /** Update / Add Estimation Qty; null clears it; left out keeps it. */
  estimatedQty: quantityInput.nullable().optional(),
  /** The minimum here; null goes back to the Material's minimum stock. */
  minStockQty: quantityInput.nullable().optional(),
  /** Start / Stop minimum stock to maintain Alert. */
  minAlertEnabled: z.boolean().optional(),
});

export const RecordConstructionProcurementStockMovementsRequestModel = z.object(
  {
    location: ConstructionProcurementStockLocationModel,
    /** Consume Material or Missing Material. */
    kind: z.enum(["consumed", "missing"]),
    lines: z
      .array(
        z.object({
          /** Consume / Missing date, today or earlier (back-dated limits apply). */
          date: z.iso.date(),
          materialId: z.uuid(),
          quantity: quantityInput,
          /** Where on the Project it was used; consumption at a Project only. */
          siteLocation: ConstructionProcurementSiteLocationModel.nullable().optional(),
          remark: z.string().max(500).nullable().optional(),
        }),
      )
      .min(1)
      .max(100),
  },
);

export const AdjustConstructionProcurementStockRequestModel = z.object({
  location: ConstructionProcurementStockLocationModel,
  materialId: z.uuid(),
  date: z.iso.date(),
  /** The quantity counted on that date; the difference posts as an Adjustment. */
  countedQty: quantityInput,
  reason: z.string().max(500),
});

export const ConstructionProcurementStockMovementParamsModel = z.object({
  id: z.uuid(),
});

export const EditConstructionProcurementStockMovementRequestModel = z.object({
  date: z.iso.date(),
  quantity: quantityInput,
  siteLocation: ConstructionProcurementSiteLocationModel.nullable().optional(),
  remark: z.string().max(500).nullable().optional(),
  /** As last read; 409 `STOCK_MOVEMENT_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const DeleteConstructionProcurementStockMovementRequestModel = z.object({
  expectedUpdatedAt: z.iso.datetime(),
});

// Responses

export const ConstructionProcurementInventoryRowResponseModel = z.object({
  materialId: z.uuid(),
  materialName: z.string(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  uomId: z.uuid(),
  uomName: z.string(),
  estimatedQty: quantity.nullable(),
  /** The ledger's sum. */
  inStock: quantity,
  /** Approved, undelivered transfers and Delivery Notes coming here. */
  inTransitIn: quantity,
  inTransitOut: quantity,
  /** What applies: the location's override, else the Material's. */
  minimum: quantity.nullable(),
  minimumOverride: quantity.nullable(),
  materialMinimum: quantity.nullable(),
  alertEnabled: z.boolean(),
  state: z.enum(STOCK_STATES),
});
export type ConstructionProcurementInventoryRowResponseModel = z.infer<
  typeof ConstructionProcurementInventoryRowResponseModel
>;

export const ListConstructionProcurementInventoryResponseModel = z.object({
  location: ConstructionProcurementStockLocationModel.extend({
    name: z.string(),
  }),
  items: z.array(ConstructionProcurementInventoryRowResponseModel),
  /** Over every material at the location, before filters. */
  summary: z.object({
    materials: z.int().nonnegative(),
    inStock: z.int().nonnegative(),
    lowStock: z.int().nonnegative(),
    outOfStock: z.int().nonnegative(),
  }),
});
export type ListConstructionProcurementInventoryResponseModel = z.infer<
  typeof ListConstructionProcurementInventoryResponseModel
>;

export const ConstructionProcurementStockMovementResponseModel = z.object({
  id: z.uuid(),
  location: ConstructionProcurementStockLocationModel,
  kind: z.enum(STOCK_MOVEMENT_KINDS),
  date: z.iso.date(),
  materialId: z.uuid(),
  /** Positive; signed for an adjustment. */
  quantity,
  siteLocation: ConstructionProcurementSiteLocationModel.nullable(),
  remark: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionProcurementStockMovementResponseModel = z.infer<
  typeof ConstructionProcurementStockMovementResponseModel
>;

export const RecordConstructionProcurementStockMovementsResponseModel = z.object(
  { items: z.array(ConstructionProcurementStockMovementResponseModel) },
);
export type RecordConstructionProcurementStockMovementsResponseModel = z.infer<
  typeof RecordConstructionProcurementStockMovementsResponseModel
>;

export const ConstructionProcurementStockEntryResponseModel = z.object({
  id: z.uuid(),
  entryDate: z.iso.date(),
  type: z.enum(STOCK_ENTRY_TYPES),
  /** "Received", "Transferred out", "Consumed" … */
  typeLabel: z.string(),
  /** Signed. */
  quantity,
  /** Stock after this entry, in ledger order. */
  balance: quantity,
  source: z.object({
    type: z.enum(STOCK_SOURCE_TYPES),
    id: z.uuid(),
    /** GRN, transfer or Delivery Note number; null for a hand entry. */
    number: z.string().nullable(),
    /** The document's page, when it has one here. */
    href: z.string().nullable(),
  }),
  /** "From Site A", "To Central Store". */
  counterpartyLabel: z.string().nullable(),
  siteLocation: ConstructionProcurementSiteLocationModel.nullable(),
  remark: z.string().nullable(),
  createdBy: z.object({ userId: z.string(), name: z.string().nullable() }),
  createdAt: z.iso.datetime(),
  /** This entry undoes that one (an edit or a delete). */
  reversesEntryId: z.uuid().nullable(),
  /** A later entry undid this one. */
  reversed: z.boolean(),
  /** The live Consume / Missing / Adjustment / Opening entry behind it, for Edit and Delete. */
  movement: z
    .object({
      id: z.uuid(),
      kind: z.enum(STOCK_MOVEMENT_KINDS),
      editable: z.boolean(),
      updatedAt: z.iso.datetime(),
    })
    .nullable(),
});
export type ConstructionProcurementStockEntryResponseModel = z.infer<
  typeof ConstructionProcurementStockEntryResponseModel
>;

export const GetConstructionProcurementInventoryHistoryResponseModel = z.object({
  material: ConstructionProcurementInventoryRowResponseModel.nullable(),
  items: z.array(ConstructionProcurementStockEntryResponseModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
});
export type GetConstructionProcurementInventoryHistoryResponseModel = z.infer<
  typeof GetConstructionProcurementInventoryHistoryResponseModel
>;

export const ConstructionProcurementStockRegisterRowResponseModel = z.object({
  materialId: z.uuid(),
  materialName: z.string(),
  categoryName: z.string().nullable(),
  uomName: z.string(),
  opening: quantity,
  received: quantity,
  transferredIn: quantity,
  transferredOut: quantity,
  issued: quantity,
  receivedFromStore: quantity,
  consumed: quantity,
  missing: quantity,
  /** Signed. */
  adjustment: quantity,
  closing: quantity,
});

export const GetConstructionProcurementStockRegisterResponseModel = z.object({
  location: ConstructionProcurementStockLocationModel.extend({
    name: z.string(),
  }),
  from: z.iso.date(),
  to: z.iso.date(),
  items: z.array(ConstructionProcurementStockRegisterRowResponseModel),
});
export type GetConstructionProcurementStockRegisterResponseModel = z.infer<
  typeof GetConstructionProcurementStockRegisterResponseModel
>;

export const ImportConstructionProcurementInventoryResponseModel = z.object({
  rows: z.array(
    z.object({
      row: z.int(),
      material: z.string(),
      materialId: z.uuid().nullable(),
      /** Opening stock to post. */
      quantity: quantity.nullable(),
      estimatedQty: quantity.nullable(),
      errors: z.array(z.object({ code: z.string(), message: z.string() })),
    }),
  ),
  errorCount: z.int().nonnegative(),
  /** Opening entries posted (0 on a preview). */
  imported: z.int().nonnegative(),
  estimatesSet: z.int().nonnegative(),
});
export type ImportConstructionProcurementInventoryResponseModel = z.infer<
  typeof ImportConstructionProcurementInventoryResponseModel
>;

// Mapping

export function toInventoryRowResponse(
  row: InventoryRow,
): ConstructionProcurementInventoryRowResponseModel {
  return { ...row };
}

export function toInventoryListResponse(
  location: { kind: "project" | "store"; id: string; name: string },
  list: InventoryList,
): ListConstructionProcurementInventoryResponseModel {
  return {
    location: { kind: location.kind, id: location.id, name: location.name },
    items: list.items.map(toInventoryRowResponse),
    summary: {
      materials: list.summary.materials,
      inStock: list.summary.in_stock,
      lowStock: list.summary.low_stock,
      outOfStock: list.summary.out_of_stock,
    },
  };
}

export function toStockMovementResponse(
  movement: StockMovement,
): ConstructionProcurementStockMovementResponseModel {
  return {
    id: movement.id,
    location: movement.location,
    kind: movement.kind,
    date: movement.date,
    materialId: movement.materialId,
    quantity: movement.quantity,
    siteLocation:
      movement.siteLocation as ConstructionProcurementStockMovementResponseModel["siteLocation"],
    remark: movement.remark,
    createdAt: movement.createdAt.toISOString(),
    updatedAt: movement.updatedAt.toISOString(),
  };
}

export function toStockEntryResponse(
  entry: HistoryEntry,
): ConstructionProcurementStockEntryResponseModel {
  return {
    ...entry,
    siteLocation:
      entry.siteLocation as ConstructionProcurementStockEntryResponseModel["siteLocation"],
    createdAt: entry.createdAt.toISOString(),
    movement:
      entry.movement == null
        ? null
        : {
            ...entry.movement,
            updatedAt: entry.movement.updatedAt.toISOString(),
          },
  };
}

export function toStockRegisterResponse(
  location: { kind: "project" | "store"; id: string; name: string },
  range: { from: string; to: string },
  rows: readonly StockRegisterRow[],
): GetConstructionProcurementStockRegisterResponseModel {
  return {
    location: { kind: location.kind, id: location.id, name: location.name },
    ...range,
    items: rows.map((row) => ({ ...row })),
  };
}

export function toImportResponse(
  result: ImportResult,
): ImportConstructionProcurementInventoryResponseModel {
  return {
    rows: result.rows,
    errorCount: result.errorCount,
    imported: result.imported,
    estimatesSet: result.estimatesSet,
  };
}
