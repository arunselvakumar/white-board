import { z } from "zod";

import type {
  SalesListItem,
  SalesSettings,
} from "@/src/sales/application/sales-settings-handlers";
import { SALES_LIMITS } from "@/src/sales/domain/sales-terms";

export const SALES_SETTINGS_PATH = "/api/construction/sales/settings";

/** The three lists' URL segments. */
export const SALES_LIST_SEGMENTS = {
  funnel_stage: "funnel-stages",
  lead_source: "lead-sources",
  lost_reason: "lost-reasons",
} as const;

export const GetConstructionSalesSettingsRequestModel = z.object({
  projectId: z.uuid(),
});

const name = z
  .string()
  .max(SALES_LIMITS.listName * 2)
  .describe(
    `Trimmed; 1–${String(SALES_LIMITS.listName)} characters, unique among the Project's live rows ignoring case (409 \`<KIND>_NAME_IN_USE\`).`,
  );

export const CreateConstructionSalesListItemRequestModel = z.object({
  projectId: z.uuid(),
  name,
});

export const RenameConstructionSalesListItemRequestModel = z.object({
  name,
  /** The row's `updatedAt` as last seen; 409 `<KIND>_CHANGED` when stale. */
  expectedUpdatedAt: z.iso.datetime(),
});

export const MoveConstructionSalesFunnelStageRequestModel = z.object({
  /** One place towards the top (`up`) or bottom (`down`) of the funnel. */
  direction: z.enum(["up", "down"]),
});

export const ConstructionSalesListItemParamsModel = z.object({ id: z.uuid() });

const item = z.object({
  id: z.uuid(),
  projectId: z.uuid(),
  name: z.string(),
  /** One of the lists every Project starts with. */
  isSeed: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export const ConstructionSalesFunnelStageResponseModel = item.extend({
  /** Funnel order, 1…n. */
  sortOrder: z.int(),
  /** Open inquiries in the stage: while above 0 it cannot be deleted. */
  openCount: z.int(),
});
export type ConstructionSalesFunnelStageResponse = z.infer<
  typeof ConstructionSalesFunnelStageResponseModel
>;

export const ConstructionSalesPickListItemResponseModel = item.extend({
  /** Disabled rows leave the pickers; old inquiries keep them. */
  isActive: z.boolean(),
  /** Live inquiries naming it: while above 0 it cannot be deleted. */
  usedCount: z.int(),
});
export type ConstructionSalesPickListItemResponse = z.infer<
  typeof ConstructionSalesPickListItemResponseModel
>;

export const GetConstructionSalesSettingsResponseModel = z.object({
  /** In funnel order. */
  funnelStages: z.array(ConstructionSalesFunnelStageResponseModel),
  /** By name, disabled ones included. */
  leadSources: z.array(ConstructionSalesPickListItemResponseModel),
  lostReasons: z.array(ConstructionSalesPickListItemResponseModel),
  /** Inquiry Update on the Project: add, rename, move, disable, delete. */
  canManage: z.boolean(),
});
export type GetConstructionSalesSettingsResponse = z.infer<
  typeof GetConstructionSalesSettingsResponseModel
>;

export const ListConstructionSalesFunnelStagesResponseModel = z.object({
  items: z.array(ConstructionSalesFunnelStageResponseModel),
});
export type ListConstructionSalesFunnelStagesResponse = z.infer<
  typeof ListConstructionSalesFunnelStagesResponseModel
>;

export function toFunnelStageResponse(
  row: SalesListItem,
): ConstructionSalesFunnelStageResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    isSeed: row.isSeed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    sortOrder: row.sortOrder,
    openCount: row.usage,
  };
}

export function toPickListItemResponse(
  row: SalesListItem,
): ConstructionSalesPickListItemResponse {
  return {
    id: row.id,
    projectId: row.projectId,
    name: row.name,
    isSeed: row.isSeed,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    isActive: row.isActive,
    usedCount: row.usage,
  };
}

export function toSalesSettingsResponse(
  settings: SalesSettings,
): GetConstructionSalesSettingsResponse {
  return {
    funnelStages: settings.funnelStages.map(toFunnelStageResponse),
    leadSources: settings.leadSources.map(toPickListItemResponse),
    lostReasons: settings.lostReasons.map(toPickListItemResponse),
    canManage: settings.canManage,
  };
}
