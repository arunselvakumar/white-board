import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type { SaveConstructionSiteWorkWorksheetSettingsRequestModel } from "@/app/api/construction/site-work/settings/worksheet-settings-models";
import type {
  ConstructionSiteWorkWorksheetResponseModel,
  ConstructionSiteWorkWorksheetSettingsResponseModel,
  CreateConstructionSiteWorkWorksheetRequestModel,
  GetConstructionSiteWorkWorksheetAttendanceResponseModel,
  GetConstructionSiteWorkWorksheetAvailableStockResponseModel,
  GetConstructionSiteWorkWorksheetFormOptionsResponseModel,
  ListConstructionSiteWorkWorksheetsResponseModel,
  UpdateConstructionSiteWorkWorksheetRequestModel,
} from "@/app/api/construction/site-work/worksheets/worksheet-models";
import type { SheetApprovalStatus } from "@/src/site-work/domain/shift";

import { apiJson } from "./http";
import { PROCUREMENT_KEY } from "./procurement-access";
import { SITE_WORK_API, SITE_WORK_KEY } from "./site-work-access";

export type Worksheet = ConstructionSiteWorkWorksheetResponseModel;
export type WorksheetPage = ListConstructionSiteWorkWorksheetsResponseModel;
export type WorksheetFormOptions =
  GetConstructionSiteWorkWorksheetFormOptionsResponseModel;
export type WorksheetSettings =
  ConstructionSiteWorkWorksheetSettingsResponseModel;
export type WorksheetAttendance =
  GetConstructionSiteWorkWorksheetAttendanceResponseModel;
export type CreateWorksheetInput = z.input<
  typeof CreateConstructionSiteWorkWorksheetRequestModel
>;
export type UpdateWorksheetInput = z.input<
  typeof UpdateConstructionSiteWorkWorksheetRequestModel
>;
export type SaveWorksheetSettingsInput = z.input<
  typeof SaveConstructionSiteWorkWorksheetSettingsRequestModel
>;

export const WORKSHEETS_API = `${SITE_WORK_API}/worksheets`;
export const WORKSHEET_SETTINGS_API = `${SITE_WORK_API}/settings/worksheets`;

/** Every Daily Worksheet key starts here (under `SITE_WORK_KEY`). */
export const WORKSHEETS_KEY = [...SITE_WORK_KEY, "worksheets"] as const;

export type WorksheetFilter = {
  projectId: string;
  from?: string;
  to?: string;
  createdBy?: string;
  contractorId?: string;
  departmentId?: string;
  approvalStatus?: SheetApprovalStatus | "";
  cursor?: { after: string } | { before: string } | null;
};

export function worksheetsQuery(filter: WorksheetFilter) {
  const query = new URLSearchParams({ projectId: filter.projectId });
  for (const key of [
    "from",
    "to",
    "createdBy",
    "contractorId",
    "departmentId",
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
    queryKey: [...WORKSHEETS_KEY, "list", text] as const,
    queryFn: () => apiJson<WorksheetPage>(`${WORKSHEETS_API}?${text}`),
  });
}

export function worksheetQuery(id: string) {
  return queryOptions({
    queryKey: [...WORKSHEETS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<Worksheet>(`${WORKSHEETS_API}/${encodeURIComponent(id)}`),
  });
}

/** Settings, Contractors with Departments, Work Types and units for the form. */
export function worksheetFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...WORKSHEETS_KEY, "form-options", projectId] as const,
    queryFn: () =>
      apiJson<WorksheetFormOptions>(
        `${WORKSHEETS_API}/form-options?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

export function worksheetSettingsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...WORKSHEETS_KEY, "settings", projectId] as const,
    queryFn: () =>
      apiJson<WorksheetSettings>(
        `${WORKSHEET_SETTINGS_API}?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

/** The "Attendance on <date>" panel; `excludeId` is the sheet being edited. */
export function worksheetAttendanceQuery(
  projectId: string,
  date: string,
  excludeId: string | null,
) {
  const query = new URLSearchParams({ projectId, date });
  if (excludeId != null) query.set("excludeWorksheetId", excludeId);
  const text = query.toString();
  return queryOptions({
    queryKey: [...WORKSHEETS_KEY, "attendance", text] as const,
    queryFn: () =>
      apiJson<WorksheetAttendance>(`${WORKSHEETS_API}/attendance?${text}`),
  });
}

/** Stock per material at the Project on the sheet date. */
export function worksheetStockQuery(
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
  if (excludeId != null) query.set("excludeWorksheetId", excludeId);
  const text = query.toString();
  return queryOptions({
    queryKey: [...WORKSHEETS_KEY, "stock", text] as const,
    queryFn: async () =>
      ids.length === 0
        ? {}
        : (
            await apiJson<GetConstructionSiteWorkWorksheetAvailableStockResponseModel>(
              `${WORKSHEETS_API}/available-stock?${text}`,
            )
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
  return `${WORKSHEETS_API}/${encodeURIComponent(id)}/${action}`;
}

/** Worksheet writes move Project stock too (Current Inventory). */
function useInvalidate() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: WORKSHEETS_KEY }),
      client.invalidateQueries({ queryKey: PROCUREMENT_KEY }),
    ]);
  };
}

export function useCreateWorksheet() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateWorksheetInput) =>
      postJson<Worksheet>(WORKSHEETS_API, input),
    onSuccess: invalidate,
  });
}

export function useUpdateWorksheet(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateWorksheetInput) =>
      postJson<Worksheet>(itemUrl(id, "update"), input),
    onSuccess: invalidate,
  });
}

export type WorksheetCommand =
  | { kind: "approve"; id: string; expectedUpdatedAt?: string }
  | { kind: "reject"; id: string; reason: string; expectedUpdatedAt?: string }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

/**
 * Approve, reject or delete one Daily Worksheet. Approve and reject answer
 * with the sheet, which goes straight into its detail cache, so the page
 * shows the new status without waiting for the refetch.
 */
export function useWorksheetCommand() {
  const client = useQueryClient();
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: async (command: WorksheetCommand): Promise<void> => {
      const { kind, id, ...body } = command;
      if (kind === "delete") {
        await postJson<unknown>(itemUrl(id, kind), body);
        return;
      }
      const sheet = await postJson<Worksheet>(itemUrl(id, kind), body);
      client.setQueryData(worksheetQuery(id).queryKey, sheet);
    },
    onSuccess: invalidate,
  });
}

/** Bulk approve or reject (all or none) on one Project. */
export function useBulkDecideWorksheets() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      ids: string[];
      approve: boolean;
      reason?: string;
    }) =>
      postJson<{ decided: number }>(
        `${WORKSHEETS_API}/${input.approve ? "bulk-approve" : "bulk-reject"}`,
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

export function useSaveWorksheetSettings() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: SaveWorksheetSettingsInput) =>
      postJson<WorksheetSettings>(WORKSHEET_SETTINGS_API, input),
    onSuccess: invalidate,
  });
}
