import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  CloseConstructionSiteWorkEquipmentMaintenanceRequestModel,
  CreateConstructionSiteWorkEquipmentRequestModel,
  GetConstructionSiteWorkEquipmentFormOptionsResponseModel,
  GetConstructionSiteWorkEquipmentResponseModel,
  GetConstructionSiteWorkEquipmentSheetOptionsResponseModel,
  ListConstructionSiteWorkEquipmentResponseModel,
  OpenConstructionSiteWorkEquipmentMaintenanceRequestModel,
  TransferConstructionSiteWorkEquipmentRequestModel,
  UpdateConstructionSiteWorkEquipmentMaintenanceRequestModel,
  UpdateConstructionSiteWorkEquipmentRequestModel,
} from "@/app/api/construction/site-work/equipment/equipment-models";
import type {
  EquipmentOwnership,
  EquipmentState,
} from "@/src/site-work/domain/equipment";

import { directUpload, postJson, type UploadOptions } from "./direct-upload";
import { apiJson } from "./http";
import { SITE_WORK_API, SITE_WORK_KEY } from "./site-work-access";

export type Equipment = z.infer<
  typeof ListConstructionSiteWorkEquipmentResponseModel
>["items"][number];
export type EquipmentDetail = z.infer<
  typeof GetConstructionSiteWorkEquipmentResponseModel
>;
export type EquipmentPage = z.infer<
  typeof ListConstructionSiteWorkEquipmentResponseModel
>;
export type EquipmentFormOptions = z.infer<
  typeof GetConstructionSiteWorkEquipmentFormOptionsResponseModel
>;
export type EquipmentSheetOptions = z.infer<
  typeof GetConstructionSiteWorkEquipmentSheetOptionsResponseModel
>;
export type CreateEquipmentInput = z.input<
  typeof CreateConstructionSiteWorkEquipmentRequestModel
>;
export type UpdateEquipmentInput = z.input<
  typeof UpdateConstructionSiteWorkEquipmentRequestModel
>;
export type TransferEquipmentInput = z.input<
  typeof TransferConstructionSiteWorkEquipmentRequestModel
>;
export type OpenMaintenanceInput = z.input<
  typeof OpenConstructionSiteWorkEquipmentMaintenanceRequestModel
>;
export type CloseMaintenanceInput = z.input<
  typeof CloseConstructionSiteWorkEquipmentMaintenanceRequestModel
>;
export type UpdateMaintenanceInput = z.input<
  typeof UpdateConstructionSiteWorkEquipmentMaintenanceRequestModel
>;

export const EQUIPMENT_API = `${SITE_WORK_API}/equipment`;
/** Every Equipment register key (CM-603); usage sheets nest their own. */
export const EQUIPMENT_KEY = [...SITE_WORK_KEY, "equipment"] as const;

export type EquipmentFilters = {
  ownership?: EquipmentOwnership | null;
  /** A Project id, or "warehouse". */
  place?: string | null;
  state?: EquipmentState | null;
  search?: string;
  after?: string | null;
};

/** The register (or one Project's equipment), newest first. */
export function equipmentListQuery(filters: EquipmentFilters = {}) {
  const params = new URLSearchParams({ limit: "50" });
  if (filters.ownership != null) params.set("ownership", filters.ownership);
  if (filters.place === "warehouse") params.set("warehouse", "true");
  else if (filters.place != null && filters.place !== "")
    params.set("projectId", filters.place);
  if (filters.state != null) params.set("state", filters.state);
  const search = filters.search?.trim() ?? "";
  if (search !== "") params.set("search", search);
  if (filters.after != null) params.set("after", filters.after);
  return queryOptions({
    queryKey: [...EQUIPMENT_KEY, "list", params.toString()],
    queryFn: () => apiJson<EquipmentPage>(`${EQUIPMENT_API}?${params}`),
  });
}

export function equipmentQuery(id: string) {
  return queryOptions({
    queryKey: [...EQUIPMENT_KEY, "detail", id],
    queryFn: () =>
      apiJson<EquipmentDetail>(`${EQUIPMENT_API}/${encodeURIComponent(id)}`),
  });
}

/** Hire parties and Projects for the form and the transfer dialog. */
export function equipmentFormOptionsQuery(projectId: string | null = null) {
  const query =
    projectId == null ? "" : `?projectId=${encodeURIComponent(projectId)}`;
  return queryOptions({
    queryKey: [...EQUIPMENT_KEY, "form-options", projectId ?? "company"],
    queryFn: () =>
      apiJson<EquipmentFormOptions>(`${EQUIPMENT_API}/form-options${query}`),
    staleTime: 60_000,
  });
}

/**
 * The equipment that may take a usage sheet at a Project on a date, with
 * its basis, hire terms and last closing reading (CM-604's form).
 */
export function equipmentSheetOptionsQuery(projectId: string, date: string) {
  const params = new URLSearchParams({ projectId, date });
  return queryOptions({
    queryKey: [...EQUIPMENT_KEY, "sheet-options", projectId, date],
    queryFn: () =>
      apiJson<EquipmentSheetOptions>(
        `${EQUIPMENT_API}/sheet-options?${params}`,
      ),
    enabled: date !== "",
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(`${EQUIPMENT_API}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Every register write can change lists, details and sheet options. */
function useInvalidate() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: SITE_WORK_KEY });
}

export function useCreateEquipment() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CreateEquipmentInput) =>
      post<EquipmentDetail>("", input),
    onSuccess: invalidate,
  });
}

export function useUpdateEquipment(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: UpdateEquipmentInput) =>
      post<EquipmentDetail>(`/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteEquipment(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (expectedUpdatedAt: string) =>
      post<undefined>(`/${encodeURIComponent(id)}/delete`, {
        expectedUpdatedAt,
      }),
    onSuccess: invalidate,
  });
}

export function useTransferEquipment(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: TransferEquipmentInput) =>
      post<EquipmentDetail>(`/${encodeURIComponent(id)}/transfer`, input),
    onSuccess: invalidate,
  });
}

export function useSetEquipmentAvailability(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { expectedUpdatedAt: string; available: boolean }) =>
      post<EquipmentDetail>(`/${encodeURIComponent(id)}/availability`, input),
    onSuccess: invalidate,
  });
}

export function useOpenMaintenance(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: OpenMaintenanceInput) =>
      post<EquipmentDetail>(`/${encodeURIComponent(id)}/maintenance`, input),
    onSuccess: invalidate,
  });
}

export function useMaintenanceAction(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (
      input:
        | {
            action: "close";
            maintenanceId: string;
            body: CloseMaintenanceInput;
          }
        | {
            action: "update";
            maintenanceId: string;
            body: UpdateMaintenanceInput;
          }
        | {
            action: "delete";
            maintenanceId: string;
            body: { expectedUpdatedAt: string };
          },
    ) =>
      post<EquipmentDetail>(
        `/${encodeURIComponent(id)}/maintenance/${encodeURIComponent(input.maintenanceId)}/${input.action}`,
        input.body,
      ),
    onSuccess: invalidate,
  });
}

/** Uploads a photo through the attachments service and records it. */
export function uploadEquipmentPhoto(
  id: string,
  file: File,
  options?: UploadOptions,
): Promise<EquipmentDetail> {
  const base = `${EQUIPMENT_API}/${encodeURIComponent(id)}/photo`;
  return directUpload({
    startUrl: `${base}/uploads`,
    file,
    options,
    complete: (started, signal) =>
      postJson<EquipmentDetail>(
        base,
        { key: started.key, fileName: started.fileName },
        signal,
      ),
  });
}

export function removeEquipmentPhoto(id: string): Promise<EquipmentDetail> {
  return post<EquipmentDetail>(`/${encodeURIComponent(id)}/photo/remove`, {});
}
