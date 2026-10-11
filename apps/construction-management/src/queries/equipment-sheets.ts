import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionSiteWorkEquipmentSheetResponseModel,
  ConstructionSiteWorkEquipmentSheetSettingsResponseModel,
  CreateConstructionSiteWorkEquipmentSheetRequestModel,
  GetConstructionSiteWorkEquipmentSheetAvailableStockResponseModel,
  GetConstructionSiteWorkEquipmentSheetFormOptionsResponseModel,
  GetConstructionSiteWorkEquipmentSheetResponseModel,
  ListConstructionSiteWorkEquipmentSheetsResponseModel,
  UpdateConstructionSiteWorkEquipmentSheetRequestModel,
} from "@/app/api/construction/site-work/equipment-sheets/equipment-sheet-models";
import type { SaveConstructionSiteWorkEquipmentSheetSettingsRequestModel } from "@/app/api/construction/site-work/settings/equipment-sheet-settings-models";
import type { EquipmentOwnership } from "@/src/site-work/domain/equipment";
import type { SheetApprovalStatus } from "@/src/site-work/domain/shift";

import { apiJson } from "./http";
import { PROCUREMENT_KEY } from "./procurement-access";
import { SITE_WORK_API, SITE_WORK_KEY } from "./site-work-access";

export type EquipmentSheet = ConstructionSiteWorkEquipmentSheetResponseModel;
export type EquipmentSheetDetail =
  GetConstructionSiteWorkEquipmentSheetResponseModel;
export type EquipmentSheetPage =
  ListConstructionSiteWorkEquipmentSheetsResponseModel;
export type EquipmentSheetFormOptions =
  GetConstructionSiteWorkEquipmentSheetFormOptionsResponseModel;
export type EquipmentSheetSettings =
  ConstructionSiteWorkEquipmentSheetSettingsResponseModel;
export type CreateEquipmentSheetInput = z.input<
  typeof CreateConstructionSiteWorkEquipmentSheetRequestModel
>;
export type UpdateEquipmentSheetInput = z.input<
  typeof UpdateConstructionSiteWorkEquipmentSheetRequestModel
>;
export type SaveEquipmentSheetSettingsInput = z.input<
  typeof SaveConstructionSiteWorkEquipmentSheetSettingsRequestModel
>;

export const EQUIPMENT_SHEETS_API = `${SITE_WORK_API}/equipment-sheets`;
export const EQUIPMENT_SHEET_SETTINGS_API = `${SITE_WORK_API}/settings/equipment-sheets`;

/** Every Equipment Usage sheet key starts here (under `SITE_WORK_KEY`). */
export const EQUIPMENT_SHEETS_KEY = [
  ...SITE_WORK_KEY,
  "equipment-sheets",
] as const;

export type EquipmentSheetFilter = {
  projectId: string;
  from?: string;
  to?: string;
  equipmentId?: string;
  ownership?: EquipmentOwnership | "";
  createdBy?: string;
  approvalStatus?: SheetApprovalStatus | "";
  cursor?: { after: string } | { before: string } | null;
};

export function equipmentSheetsQuery(filter: EquipmentSheetFilter) {
  const query = new URLSearchParams({ projectId: filter.projectId });
  for (const key of [
    "from",
    "to",
    "equipmentId",
    "ownership",
    "createdBy",
    "approvalStatus",
  ] as const) {
    const value = filter[key];
    if (value != null && value !== "") query.set(key, value);
  }
  if (filter.cursor != null) {
    if ("after" in filter.cursor) query.set("after", filter.cursor.after);
    else query.set("before", filter.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...EQUIPMENT_SHEETS_KEY, "list", text] as const,
    queryFn: () =>
      apiJson<EquipmentSheetPage>(`${EQUIPMENT_SHEETS_API}?${text}`),
  });
}

export function equipmentSheetQuery(id: string) {
  return queryOptions({
    queryKey: [...EQUIPMENT_SHEETS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<EquipmentSheetDetail>(
        `${EQUIPMENT_SHEETS_API}/${encodeURIComponent(id)}`,
      ),
  });
}

/** Settings, supervisors, Contractors with Departments and units for the form. */
export function equipmentSheetFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...EQUIPMENT_SHEETS_KEY, "form-options", projectId] as const,
    queryFn: () =>
      apiJson<EquipmentSheetFormOptions>(
        `${EQUIPMENT_SHEETS_API}/form-options?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

export function equipmentSheetSettingsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...EQUIPMENT_SHEETS_KEY, "settings", projectId] as const,
    queryFn: () =>
      apiJson<EquipmentSheetSettings>(
        `${EQUIPMENT_SHEET_SETTINGS_API}?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

/** Stock per material at the Project on the sheet date. */
export function equipmentSheetStockQuery(
  projectId: string,
  date: string,
  materialIds: readonly string[],
  excludeId: string | null,
) {
  const ids = [...new Set(materialIds)].sort();
  const query = new URLSearchParams({
    projectId,
    date,
    materialIds: ids.join(","),
  });
  if (excludeId != null) query.set("excludeSheetId", excludeId);
  const text = query.toString();
  return queryOptions({
    queryKey: [...EQUIPMENT_SHEETS_KEY, "stock", text] as const,
    queryFn: async () =>
      ids.length === 0
        ? {}
        : (
            await apiJson<
              z.infer<
                typeof GetConstructionSiteWorkEquipmentSheetAvailableStockResponseModel
              >
            >(`${EQUIPMENT_SHEETS_API}/available-stock?${text}`)
          ).stock,
  });
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function itemUrl(id: string, action: string): string {
  return `${EQUIPMENT_SHEETS_API}/${encodeURIComponent(id)}/${action}`;
}

/**
 * Sheet writes move Project stock (Current Inventory) and the equipment's
 * sheet options (last closing reading, transfer limits) too.
 */
function useInvalidate() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: SITE_WORK_KEY }),
      client.invalidateQueries({ queryKey: PROCUREMENT_KEY }),
    ]);
  };
}

export function useCreateEquipmentSheet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateEquipmentSheetInput) =>
      postJson<EquipmentSheetDetail>(EQUIPMENT_SHEETS_API, input),
    onSuccess: invalidate,
  });
}

export function useUpdateEquipmentSheet(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateEquipmentSheetInput) =>
      postJson<EquipmentSheetDetail>(itemUrl(id, "update"), input),
    onSuccess: invalidate,
  });
}

export type EquipmentSheetCommand =
  | { kind: "approve"; id: string; expectedUpdatedAt?: string }
  | { kind: "reject"; id: string; reason: string; expectedUpdatedAt?: string }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

/**
 * Approve, reject or delete one Equipment Usage sheet. Approve and reject
 * answer with the sheet, which goes straight into its detail cache.
 */
export function useEquipmentSheetCommand() {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (command: EquipmentSheetCommand): Promise<void> => {
      const { kind, id, ...body } = command;
      if (kind === "delete") {
        await postJson<unknown>(itemUrl(id, kind), body);
        return;
      }
      const sheet = await postJson<EquipmentSheetDetail>(
        itemUrl(id, kind),
        body,
      );
      client.setQueryData(equipmentSheetQuery(id).queryKey, sheet);
    },
    onSuccess: invalidate,
  });
}

/** Bulk approve or reject (all or none) on one Project. */
export function useBulkDecideEquipmentSheets() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      ids: string[];
      approve: boolean;
      reason?: string;
    }) =>
      postJson<{ decided: number }>(
        `${EQUIPMENT_SHEETS_API}/${input.approve ? "bulk-approve" : "bulk-reject"}`,
        input.approve
          ? { projectId: input.projectId, ids: input.ids }
          : {
              projectId: input.projectId,
              ids: input.ids,
              reason: input.reason,
            },
      ),
    onSuccess: invalidate,
  });
}

export function useSaveEquipmentSheetSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: SaveEquipmentSheetSettingsInput) =>
      postJson<EquipmentSheetSettings>(EQUIPMENT_SHEET_SETTINGS_API, input),
    onSuccess: invalidate,
  });
}

/** Pages of a Project's Equipment Usage sheets. */
export function equipmentSheetsPath(projectId: string, rest = ""): string {
  return `/app/projects/${encodeURIComponent(projectId)}/equipment/usage-sheets${rest}`;
}
