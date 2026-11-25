import { z } from "zod";

// Quantities are whole numbers; calendar dates are YYYY-MM-DD; money is paise.

const CategoryModel = z.enum([
  "books",
  "notebooks",
  "stationery",
  "uniform",
  "kit",
  "toys_learning_aids",
  "housekeeping",
  "furniture_equipment",
  "other",
]);
const ItemKindModel = z.enum(["consumable", "asset"]);
const MovementKindModel = z.enum([
  "received",
  "issued_to_child",
  "issued_to_classroom",
  "issued_to_staff",
  "transfer_out",
  "transfer_in",
  "adjusted",
]);
const RefModel = z.object({ id: z.uuid(), name: z.string() });
const Count = z.number().int().min(1).max(100_000);

export const PreschoolStockIdParamsModel = z.object({ id: z.uuid() });
export const PreschoolStockChildParamsModel = z.object({ childId: z.uuid() });

export const PreschoolStockItemModel = z.object({
  id: z.uuid(),
  name: z.string(),
  category: CategoryModel,
  kind: ItemKindModel,
  unit: z.string(),
  reorderLevel: z.number().int().nullable(),
  isArchived: z.boolean(),
});

export const PreschoolStockItemListResponseModel = z.object({
  items: z.array(PreschoolStockItemModel),
});

export const ListPreschoolStockItemsRequestModel = z.object({
  includeArchived: z.enum(["true", "false"]).optional(),
});

export const PreschoolStockItemDetailsRequestModel = z.object({
  name: z.string().trim().min(1).max(200),
  category: CategoryModel,
  kind: ItemKindModel,
  /** "piece", "set", "box", "packet", "pair" */
  unit: z.string().trim().min(1).max(20),
  /** At or below this a Centre is low; omit for never. */
  reorderLevel: z.number().int().min(0).max(100_000).nullable().optional(),
});

export const ListPreschoolStockRequestModel = z.object({
  centreId: z.uuid(),
  category: CategoryModel.optional(),
  lowOnly: z.enum(["true", "false"]).optional(),
});

export const PreschoolStockOnHandResponseModel = z.object({
  centreId: z.uuid(),
  itemsInStock: z.number().int(),
  lowItems: z.number().int(),
  items: z.array(
    z.object({
      itemId: z.uuid(),
      name: z.string(),
      category: CategoryModel,
      kind: ItemKindModel,
      unit: z.string(),
      reorderLevel: z.number().int().nullable(),
      onHand: z.number().int(),
      low: z.boolean(),
      lastMovedOn: z.iso.date().nullable(),
    }),
  ),
});

const Movement = {
  /** Defaults to today in India; never in the future. */
  movedOn: z.iso.date().optional(),
  note: z.string().trim().max(300).nullable().optional(),
};
const Lines = z
  .array(z.object({ itemId: z.uuid(), quantity: Count }))
  .min(1)
  .max(50);

export const ReceivePreschoolStockRequestModel = z.object({
  centreId: z.uuid(),
  ...Movement,
  supplierName: z.string().trim().max(200).nullable().optional(),
  billNumber: z.string().trim().max(60).nullable().optional(),
  lines: z
    .array(
      z.object({
        itemId: z.uuid(),
        quantity: Count,
        unitCostPaise: z.number().int().min(0).nullable().optional(),
      }),
    )
    .min(1)
    .max(50),
});

export const IssuePreschoolStockToChildRequestModel = z.object({
  centreId: z.uuid(),
  childId: z.uuid(),
  ...Movement,
  lines: Lines,
});

export const IssuePreschoolStockToClassroomRequestModel = z.object({
  centreId: z.uuid(),
  classroomId: z.uuid(),
  ...Movement,
  lines: Lines,
});

export const IssuePreschoolStockToStaffRequestModel = z.object({
  centreId: z.uuid(),
  staffId: z.uuid(),
  ...Movement,
  lines: Lines,
});

export const AdjustPreschoolStockRequestModel = z.object({
  centreId: z.uuid(),
  itemId: z.uuid(),
  /** Signed and never zero: −3 for three damaged, +2 for two found. */
  quantity: z
    .number()
    .int()
    .min(-100_000)
    .max(100_000)
    .refine((value) => value !== 0, "Enter a quantity other than zero."),
  movedOn: z.iso.date().optional(),
  /** Why: damaged, lost, a count correction. */
  note: z.string().trim().min(1).max(300),
});

export const TransferPreschoolStockRequestModel = z.object({
  fromCentreId: z.uuid(),
  toCentreId: z.uuid(),
  ...Movement,
  lines: Lines,
});

export const PreschoolStockMovementResultModel = z.object({
  movementIds: z.array(z.uuid()),
  balances: z.array(
    z.object({
      centreId: z.uuid(),
      itemId: z.uuid(),
      onHand: z.number().int(),
    }),
  ),
});

export const ListPreschoolStockMovementsRequestModel = z.object({
  centreId: z.uuid(),
  itemId: z.uuid().optional(),
  childId: z.uuid().optional(),
  kind: MovementKindModel.optional(),
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.uuid().optional(),
});

export const PreschoolStockLedgerResponseModel = z.object({
  items: z.array(
    z.object({
      id: z.uuid(),
      centreId: z.uuid(),
      movedOn: z.iso.date(),
      kind: MovementKindModel,
      itemId: z.uuid(),
      itemName: z.string(),
      unit: z.string(),
      quantityDelta: z.number().int(),
      child: RefModel.nullable(),
      classroom: RefModel.nullable(),
      staff: RefModel.nullable(),
      otherCentre: RefModel.nullable(),
      supplierName: z.string().nullable(),
      billNumber: z.string().nullable(),
      unitCostPaise: z.number().int().nullable(),
      transferId: z.uuid().nullable(),
      note: z.string().nullable(),
      recordedByName: z.string(),
      balanceAfter: z.number().int().nullable(),
    }),
  ),
  nextCursor: z.uuid().nullable(),
  total: z.number().int(),
});

export const PreschoolChildStockIssuedResponseModel = z.object({
  items: z.array(
    z.object({
      movementId: z.uuid(),
      itemId: z.uuid(),
      itemName: z.string(),
      unit: z.string(),
      quantity: z.number().int(),
      movedOn: z.iso.date(),
      note: z.string().nullable(),
    }),
  ),
});
