import { z } from "zod";

/**
 * The material picker's read (M5): live, enabled Materials by name, for
 * every procurement form. Contract shared by CM-501 (which serves it) and
 * the PR, PO, GRN, inventory, transfer and MR forms (which pick from it).
 */
export const ListConstructionMastersMaterialOptionsRequestModel = z.object({
  /** Name or specification contains, ignoring case. */
  search: z.string().trim().max(120).optional(),
  categoryId: z.uuid().optional(),
  /** Comma-separated ids to load (a form reopening its lines). */
  ids: z.string().max(4000).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListConstructionMastersMaterialOptionsRequestModel = z.infer<
  typeof ListConstructionMastersMaterialOptionsRequestModel
>;

export const ConstructionMastersMaterialOptionModel = z.object({
  id: z.uuid(),
  name: z.string(),
  specification: z.string().nullable(),
  uomId: z.uuid(),
  uomName: z.string(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  /** Rate details; `null` without Materials Financial or when not set. */
  unitRate: z.int().nullable(),
  discount: z
    .discriminatedUnion("type", [
      z.object({ type: z.literal("amount"), paise: z.int() }),
      z.object({ type: z.literal("percent"), percent: z.string() }),
    ])
    .nullable(),
  /** Percent as a decimal string ("18.00"). */
  gstRate: z.string().nullable(),
  hsnCode: z.string().nullable(),
  /** Decimal string. */
  minStockQty: z.string().nullable(),
});
export type ConstructionMastersMaterialOptionModel = z.infer<
  typeof ConstructionMastersMaterialOptionModel
>;

export const ListConstructionMastersMaterialOptionsResponseModel = z.object({
  items: z.array(ConstructionMastersMaterialOptionModel),
});
export type ListConstructionMastersMaterialOptionsResponseModel = z.infer<
  typeof ListConstructionMastersMaterialOptionsResponseModel
>;
