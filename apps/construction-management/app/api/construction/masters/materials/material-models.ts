import { z } from "zod";

import type { MaterialReadModel } from "@/src/masters/application/material-master-handlers";
import { MATERIAL_ITEM_TYPES } from "@/src/masters/domain/material";

import { expectedUpdatedAt } from "../_lib/master-models";
import { pagedListModel, pagedListQuery } from "../_lib/paged-master-routes";

const paise = z.int().min(0).max(Number.MAX_SAFE_INTEGER);

const discount = z
  .discriminatedUnion("type", [
    z.object({ type: z.literal("amount"), paise }),
    z.object({
      type: z.literal("percent"),
      percent: z.string().max(20).describe("0–100, at most two decimals."),
    }),
  ])
  .nullable();

const itemType = z
  .enum(MATERIAL_ITEM_TYPES)
  .describe("Consumable (used up on site), non-consumable (reused) or asset.");

const fields = {
  name: z
    .string()
    .max(1000)
    .describe(
      "Required, at most 120 characters; unique among live Materials ignoring case (409 MATERIAL_NAME_IN_USE).",
    ),
  specification: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .describe("At most 500 characters."),
  uomId: z
    .uuid()
    .describe(
      "A live, enabled Measurement Unit (400 MEASUREMENT_UNIT_NOT_FOUND / MEASUREMENT_UNIT_DISABLED; a disabled one it already has stays).",
    ),
  categoryId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "A live, enabled Material Category (400 MATERIAL_CATEGORY_NOT_FOUND / MATERIAL_CATEGORY_DISABLED).",
    ),
  itemType: itemType.optional().default("consumable"),
  minStockQty: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe("Minimum stock to keep at each location: a decimal, ≤ 3 places."),
  unitRate: paise
    .nullable()
    .optional()
    .describe(
      "Rate Details (Financial): paise per unit. Ignored without Materials Financial.",
    ),
  discount: discount
    .optional()
    .describe(
      "Rate Details (Financial): ₹ in paise or a percent. Ignored without Financial.",
    ),
  gstRate: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .describe(
      "Rate Details (Financial): GST %, 0–100. Ignored without Financial.",
    ),
  hsnCode: z
    .string()
    .max(20)
    .nullable()
    .optional()
    .describe(
      "Rate Details (Financial): 4 to 8 digits. Ignored without Financial.",
    ),
};

export const ConstructionMastersMaterialResponseModel = z.object({
  id: z.uuid(),
  name: z.string(),
  specification: z.string().nullable(),
  uomId: z.uuid(),
  uomName: z.string(),
  categoryId: z.uuid().nullable(),
  categoryName: z.string().nullable(),
  itemType,
  unitRate: z
    .int()
    .nullable()
    .describe("Paise; null without Materials Financial or when not set."),
  discount: discount.describe("Null without Financial or when not set."),
  gstRate: z
    .string()
    .nullable()
    .describe('"18.00"; null without Financial or when not set.'),
  hsnCode: z.string().nullable().describe("Null without Financial."),
  minStockQty: z.string().nullable().describe('"50.000"'),
  disabled: z.boolean().describe("Off the pickers; documents keep it."),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ConstructionMastersMaterialResponseModel = z.infer<
  typeof ConstructionMastersMaterialResponseModel
>;

export const ListConstructionMastersMaterialsQueryModel = pagedListQuery({
  q: z
    .string()
    .trim()
    .max(120)
    .optional()
    .describe("Name, specification or HSN contains, ignoring case."),
  categoryId: z.uuid().optional(),
  itemType: itemType.optional(),
});

export const ListConstructionMastersMaterialsResponseModel = pagedListModel(
  ConstructionMastersMaterialResponseModel,
).extend({
  financial: z
    .boolean()
    .describe(
      "Whether the caller has Materials Financial: sees and sets Rate Details.",
    ),
});
export type ListConstructionMastersMaterialsResponseModel = z.infer<
  typeof ListConstructionMastersMaterialsResponseModel
>;

export const CreateConstructionMastersMaterialRequestModel = z.object(fields);
export type CreateConstructionMastersMaterialRequestModel = z.input<
  typeof CreateConstructionMastersMaterialRequestModel
>;

/** The whole form with the `updatedAt` it loaded. */
export const UpdateConstructionMastersMaterialRequestModel = z.object({
  ...fields,
  expectedUpdatedAt: expectedUpdatedAt("MATERIAL"),
});
export type UpdateConstructionMastersMaterialRequestModel = z.input<
  typeof UpdateConstructionMastersMaterialRequestModel
>;

/** Rate Details only for a reader with Materials Financial. */
export function toMaterialResponse(
  item: MaterialReadModel,
  financial: boolean,
): ConstructionMastersMaterialResponseModel {
  return {
    id: item.id,
    name: item.name,
    specification: item.specification,
    uomId: item.uomId,
    uomName: item.uomName,
    categoryId: item.categoryId,
    categoryName: item.categoryName,
    itemType: item.itemType,
    unitRate: financial ? item.unitRate : null,
    discount: financial ? item.discount : null,
    gstRate: financial ? item.gstRate : null,
    hsnCode: financial ? item.hsnCode : null,
    minStockQty: item.minStockQty,
    disabled: item.disabled,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}
