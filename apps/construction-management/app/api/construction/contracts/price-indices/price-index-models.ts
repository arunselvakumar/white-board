import { z } from "zod";

import type { StoredPriceIndex } from "@/src/contracts/application/escalation-ports";
import type { PriceIndexList } from "@/src/contracts/application/price-index-handlers";
import { indexText } from "@/src/contracts/domain/escalation";
import { FLAGS } from "@/src/shared-kernel/access";

export const PRICE_INDICES_PATH = "/api/construction/contracts/price-indices";

const value = z
  .union([z.string().max(30), z.number()])
  .describe(
    'More than 0 with at most four decimals ("153.2500"; 400 PRICE_INDEX_VALUE_INVALID).',
  );

export const ConstructionContractsPriceIndexParamsModel = z.object({
  id: z.uuid(),
});

export const CreateConstructionContractsPriceIndexRequestModel = z.object({
  series: z
    .string()
    .max(500)
    .describe(
      "Free text, at most 80 characters; matched to a series already kept ignoring case (400 PRICE_INDEX_SERIES_REQUIRED, PRICE_INDEX_SERIES_TOO_LONG).",
    ),
  month: z
    .string()
    .max(30)
    .describe(
      "YYYY-MM or the first of the month (400 PRICE_INDEX_MONTH_INVALID). One per series and month (409 PRICE_INDEX_EXISTS).",
    ),
  value,
});
export type CreateConstructionContractsPriceIndexRequestModel = z.input<
  typeof CreateConstructionContractsPriceIndexRequestModel
>;

export const UpdateConstructionContractsPriceIndexRequestModel = z.object({
  value,
  expectedUpdatedAt: z.iso
    .datetime()
    .optional()
    .describe("The index's `updatedAt` as loaded (409 PRICE_INDEX_CHANGED)."),
});

export const ConstructionContractsPriceIndexModel = z.object({
  id: z.uuid(),
  series: z.string(),
  month: z.string().describe("The first day of the month."),
  value: z.string().describe('Four places ("153.2500").'),
  updatedAt: z.iso.datetime(),
});
export type ConstructionContractsPriceIndexModel = z.infer<
  typeof ConstructionContractsPriceIndexModel
>;

export const ListConstructionContractsPriceIndicesResponseModel = z.object({
  series: z.array(
    z.object({
      name: z.string(),
      indices: z
        .array(ConstructionContractsPriceIndexModel)
        .describe("Month order."),
    }),
  ),
  suggestions: z
    .array(z.string())
    .describe("Usual series the Company does not keep yet."),
  viewerFlags: z
    .array(z.enum(FLAGS))
    .describe(
      "The Item Library flags the caller holds: price indices use that menu.",
    ),
});
export type ListConstructionContractsPriceIndicesResponseModel = z.infer<
  typeof ListConstructionContractsPriceIndicesResponseModel
>;

export const ImportConstructionContractsPriceIndicesResponseModel = z.object({
  created: z.int().nonnegative(),
  updated: z.int().nonnegative(),
  unchanged: z.int().nonnegative(),
});
export type ImportConstructionContractsPriceIndicesResponseModel = z.infer<
  typeof ImportConstructionContractsPriceIndicesResponseModel
>;

export function toPriceIndexResponse(
  row: StoredPriceIndex,
): ConstructionContractsPriceIndexModel {
  return {
    id: row.id,
    series: row.series,
    month: row.month,
    value: indexText(row.value),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toPriceIndexListResponse(
  list: PriceIndexList,
): ListConstructionContractsPriceIndicesResponseModel {
  return {
    series: list.series.map((series) => ({
      name: series.name,
      indices: series.indices.map(toPriceIndexResponse),
    })),
    suggestions: list.suggestions,
    viewerFlags: list.viewerFlags,
  };
}
