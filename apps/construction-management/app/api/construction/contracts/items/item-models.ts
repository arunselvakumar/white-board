import { z } from "zod";

import type {
  ItemFormOptions,
  ItemMaterialOption,
  ItemSummaryView,
  ItemView,
} from "@/src/contracts/application/item-handlers";
import {
  ITEM_CODE_MAX,
  ITEM_DESCRIPTION_MAX,
  ITEM_SCHEDULE_MAX,
  ITEM_SHORT_DESCRIPTION_MAX,
} from "@/src/contracts/domain/item";
import {
  ANALYSIS_KINDS,
  ANALYSIS_LINES_MAX,
  COEFFICIENT_SCALE,
  fixedDecimal,
  PERCENT_SCALE,
} from "@/src/contracts/domain/item-analysis";
import type { ItemCursor } from "@/src/contracts/application/item-handlers";
import { DomainError } from "@/src/shared-kernel/domain-error";
import { FLAGS } from "@/src/shared-kernel/access";

export const ITEMS_PATH = "/api/construction/contracts/items";

const decimalInput = z.union([z.string().trim().max(30), z.number()]);

const AnalysisLineRequestModel = z.object({
  kind: z.enum(ANALYSIS_KINDS),
  materialId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Required on a material line (400 ANALYSIS_MATERIAL_REQUIRED); a live, enabled Material of the Company (400 ANALYSIS_MATERIAL_INVALID). Ignored on other kinds.",
    ),
  labourCategoryId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Required on a labour line (ANALYSIS_LABOUR_CATEGORY_REQUIRED / _INVALID).",
    ),
  equipmentId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "Required on an equipment line (ANALYSIS_EQUIPMENT_REQUIRED / _INVALID).",
    ),
  description: z
    .string()
    .max(1000)
    .nullable()
    .optional()
    .describe(
      "At most 200 characters; required on a lump sum (400 ANALYSIS_DESCRIPTION_REQUIRED).",
    ),
  coefficient: decimalInput
    .nullable()
    .optional()
    .describe(
      "Resource units per Item unit (kg per cum, days per cum, hours per cum): more than 0, at most four decimals (400 ANALYSIS_COEFFICIENT_INVALID). Always 1 on a lump sum.",
    ),
  resourceUomId: z
    .uuid()
    .nullable()
    .optional()
    .describe(
      "The resource's UoM (400 ANALYSIS_UOM_INVALID). A material line without one takes the Material's.",
    ),
  rate: z
    .int()
    .describe(
      "Paise per resource unit (per Item unit on a lump sum), 0 to ₹1,000 crore (400 ANALYSIS_RATE_INVALID).",
    ),
});

const itemFields = {
  code: z
    .string()
    .max(200)
    .describe(
      `Required, at most ${String(ITEM_CODE_MAX)} characters; unique among the Company's live Items ignoring case (409 ITEM_CODE_TAKEN).`,
    ),
  shortDescription: z
    .string()
    .max(2000)
    .describe(
      `Required, at most ${String(ITEM_SHORT_DESCRIPTION_MAX)} characters.`,
    ),
  description: z
    .string()
    .max(20_000)
    .nullable()
    .optional()
    .describe(
      `The schedule's full wording, at most ${String(ITEM_DESCRIPTION_MAX)} characters.`,
    ),
  uomId: z
    .uuid()
    .describe(
      "A live, enabled UoM of the Company (400 ITEM_UOM_INVALID); a disabled one the Item already has may stay.",
    ),
  sacHsn: z
    .string()
    .max(30)
    .nullable()
    .optional()
    .describe("SAC or HSN code: 4 to 8 digits (400 SAC_HSN_INVALID)."),
  schedule: z
    .string()
    .max(500)
    .nullable()
    .optional()
    .describe(
      `Free text such as "CPWD DSR 2023" or "Own", at most ${String(ITEM_SCHEDULE_MAX)} characters.`,
    ),
  adoptedRate: z
    .int()
    .describe(
      "Paise per UoM: the rate the Company uses, 0 to ₹1,000 crore (400 ITEM_RATE_INVALID).",
    ),
  overheadPercent: decimalInput
    .nullable()
    .optional()
    .describe(
      "Overhead and profit on the rate analysis, 0 to 100 with two decimals (400 OVERHEAD_PERCENT_INVALID).",
    ),
  lines: z
    .array(AnalysisLineRequestModel)
    .max(1000)
    .optional()
    .describe(
      `The rate analysis in order, at most ${String(ANALYSIS_LINES_MAX)} lines (400 ANALYSIS_TOO_MANY_LINES); each error names \`details.line\` (from 0). Omitted or empty: no analysis. An update replaces the lines.`,
    ),
};

export const CreateConstructionContractsItemRequestModel = z.object(itemFields);
export type CreateConstructionContractsItemRequestModel = z.input<
  typeof CreateConstructionContractsItemRequestModel
>;

export const UpdateConstructionContractsItemRequestModel = z.object({
  ...itemFields,
  expectedUpdatedAt: z.iso
    .datetime()
    .describe(
      "The `updatedAt` you loaded; 409 ITEM_CHANGED when someone saved since.",
    ),
});
export type UpdateConstructionContractsItemRequestModel = z.input<
  typeof UpdateConstructionContractsItemRequestModel
>;

export const DeleteConstructionContractsItemRequestModel = z.object({
  expectedUpdatedAt: z.iso
    .datetime()
    .nullable()
    .optional()
    .describe("When sent, 409 ITEM_CHANGED if someone saved since."),
});

export const ConstructionContractsItemParamsModel = z.object({ id: z.uuid() });

const filter = {
  q: z
    .string()
    .trim()
    .max(100)
    .optional()
    .describe("Part of the code, short description or description."),
  schedule: z
    .string()
    .trim()
    .max(ITEM_SCHEDULE_MAX)
    .optional()
    .describe("Only Items of this schedule."),
};

export const ListConstructionContractsItemsRequestModel = z
  .object({
    ...filter,
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
    after: z.string().min(1).max(500).optional(),
    before: z.string().min(1).max(500).optional(),
  })
  .refine((value) => value.after == null || value.before == null, {
    message: "after and before are mutually exclusive.",
    path: ["after"],
  });

export const ExportConstructionContractsItemsRequestModel = z.object(filter);

export const ConstructionContractsItemSummaryModel = z.object({
  id: z.uuid(),
  code: z.string(),
  shortDescription: z.string(),
  description: z.string().nullable(),
  uomId: z.uuid(),
  uomName: z.string(),
  sacHsn: z.string().nullable(),
  schedule: z.string().nullable(),
  adoptedRate: z.int().describe("Paise per UoM."),
  overheadPercent: z
    .string()
    .nullable()
    .describe('Two places ("15.00"); null when not set.'),
  analysedRate: z
    .int()
    .nullable()
    .describe(
      "Paise per UoM: round(Σ line amounts × (1 + overhead / 100)); null without an analysis.",
    ),
  lineCount: z.int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso
    .datetime()
    .describe("Send it back as `expectedUpdatedAt` when you edit."),
});
export type ConstructionContractsItemSummaryModel = z.infer<
  typeof ConstructionContractsItemSummaryModel
>;

export const ConstructionContractsItemLineModel = z.object({
  id: z.uuid(),
  position: z.int().nonnegative(),
  kind: z.enum(ANALYSIS_KINDS),
  materialId: z.uuid().nullable(),
  materialName: z.string().nullable(),
  labourCategoryId: z.uuid().nullable(),
  labourCategoryName: z.string().nullable(),
  equipmentId: z.uuid().nullable(),
  equipmentName: z.string().nullable().describe('"JCB 3DX (TN-07-1234)".'),
  description: z.string().nullable(),
  coefficient: z.string().describe('Four places ("0.4500").'),
  resourceUomId: z.uuid().nullable(),
  resourceUomName: z.string().nullable(),
  rate: z.int().describe("Paise per resource unit."),
  amount: z.int().describe("Paise per Item unit: round(coefficient × rate)."),
});
export type ConstructionContractsItemLineModel = z.infer<
  typeof ConstructionContractsItemLineModel
>;

export const ConstructionContractsItemResponseModel =
  ConstructionContractsItemSummaryModel.extend({
    lines: z.array(ConstructionContractsItemLineModel),
  });
export type ConstructionContractsItemResponseModel = z.infer<
  typeof ConstructionContractsItemResponseModel
>;

export const ListConstructionContractsItemsResponseModel = z.object({
  items: z.array(ConstructionContractsItemSummaryModel),
  nextCursor: z.string().nullable(),
  prevCursor: z.string().nullable(),
  total: z.int().nonnegative(),
  viewerFlags: z
    .array(z.enum(FLAGS))
    .describe(
      "The Item Library flags the caller holds, so the screen can hide Add, Import and Export. Every route checks again.",
    ),
});
export type ListConstructionContractsItemsResponseModel = z.infer<
  typeof ListConstructionContractsItemsResponseModel
>;

export const ListConstructionContractsItemSchedulesResponseModel = z.object({
  items: z.array(z.string()),
});
export type ListConstructionContractsItemSchedulesResponseModel = z.infer<
  typeof ListConstructionContractsItemSchedulesResponseModel
>;

export const ImportConstructionContractsItemsResponseModel = z.object({
  created: z.int().nonnegative(),
  updated: z.int().nonnegative(),
  unchanged: z
    .int()
    .nonnegative()
    .describe("Rows whose Item already had exactly these fields."),
});
export type ImportConstructionContractsItemsResponseModel = z.infer<
  typeof ImportConstructionContractsItemsResponseModel
>;

export const ConstructionContractsItemFormOptionsResponseModel = z.object({
  uoms: z.array(z.object({ id: z.uuid(), name: z.string() })),
  labourCategories: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      skill: z.enum(["skilled", "unskilled"]),
    }),
  ),
  equipment: z.array(
    z.object({ id: z.uuid(), name: z.string(), equipmentNumber: z.string() }),
  ),
});
export type ConstructionContractsItemFormOptionsResponseModel = z.infer<
  typeof ConstructionContractsItemFormOptionsResponseModel
>;

export const ListConstructionContractsItemMaterialOptionsRequestModel =
  z.object({
    search: z.string().trim().max(100).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional().default(50),
  });

export const ConstructionContractsItemMaterialOptionModel = z.object({
  id: z.uuid(),
  name: z.string(),
  specification: z.string().nullable(),
  uomId: z.uuid(),
  uomName: z.string(),
  unitRate: z
    .int()
    .nullable()
    .describe(
      "Paise per unit: the line's suggested rate. Null when not set or without the Materials menu's Financial flag.",
    ),
});
export type ConstructionContractsItemMaterialOptionModel = z.infer<
  typeof ConstructionContractsItemMaterialOptionModel
>;

export const ListConstructionContractsItemMaterialOptionsResponseModel =
  z.object({ items: z.array(ConstructionContractsItemMaterialOptionModel) });
export type ListConstructionContractsItemMaterialOptionsResponseModel = z.infer<
  typeof ListConstructionContractsItemMaterialOptionsResponseModel
>;

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

const money = (paise: bigint): number => Number(paise);

export function toItemSummaryResponse(
  item: ItemSummaryView,
): ConstructionContractsItemSummaryModel {
  return {
    id: item.id,
    code: item.code,
    shortDescription: item.shortDescription,
    description: item.description,
    uomId: item.uomId,
    uomName: item.uomName,
    sacHsn: item.sacHsn,
    schedule: item.schedule,
    adoptedRate: money(item.adoptedRate),
    overheadPercent:
      item.overheadPercent == null
        ? null
        : fixedDecimal(item.overheadPercent, PERCENT_SCALE),
    analysedRate: item.analysedRate == null ? null : money(item.analysedRate),
    lineCount: item.lineCount,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export function toItemResponse(
  item: ItemView,
): ConstructionContractsItemResponseModel {
  return {
    ...toItemSummaryResponse(item),
    lines: item.lines.map((line) => ({
      id: line.id,
      position: line.position,
      kind: line.kind,
      materialId: line.materialId,
      materialName: line.materialName,
      labourCategoryId: line.labourCategoryId,
      labourCategoryName: line.labourCategoryName,
      equipmentId: line.equipmentId,
      equipmentName: line.equipmentName,
      description: line.description,
      coefficient: fixedDecimal(line.coefficient, COEFFICIENT_SCALE),
      resourceUomId: line.resourceUomId,
      resourceUomName: line.resourceUomName,
      rate: money(line.rate),
      amount: money(line.amount),
    })),
  };
}

export function toFormOptionsResponse(
  options: ItemFormOptions,
): ConstructionContractsItemFormOptionsResponseModel {
  return {
    uoms: options.uoms.map((uom) => ({ id: uom.id, name: uom.name })),
    labourCategories: options.labourCategories.map((category) => ({
      id: category.id,
      name: category.name,
      skill: category.skill,
    })),
    equipment: options.equipment.map((row) => ({
      id: row.id,
      name: row.name,
      equipmentNumber: row.equipmentNumber,
    })),
  };
}

export function toMaterialOptionResponse(
  option: ItemMaterialOption,
): ConstructionContractsItemMaterialOptionModel {
  return {
    ...option,
    unitRate: option.unitRate == null ? null : money(option.unitRate),
  };
}

// ---------------------------------------------------------------------------
// The list cursor: code order, then id
// ---------------------------------------------------------------------------

export function encodeItemCursor(cursor: ItemCursor): string {
  return Buffer.from(JSON.stringify([cursor.code, cursor.id]), "utf8").toString(
    "base64url",
  );
}

export function decodeItemCursor(raw: string): ItemCursor {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === "string" &&
      typeof value[1] === "string" &&
      z.uuid().safeParse(value[1]).success
    )
      return { code: value[0], id: value[1] };
  } catch {
    // Falls through to the error.
  }
  throw new DomainError("INVALID_CURSOR", "The page cursor is not valid.");
}
