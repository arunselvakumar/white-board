import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionProcurementMaterialRequestResponseModel,
  GetConstructionProcurementMaterialRequestFormOptionsResponseModel,
  ListConstructionProcurementMaterialRequestsResponseModel,
} from "@/app/api/construction/procurement/material-requests/material-request-models";
import type { LocationRefInput } from "@/src/shared-kernel/location-ref";

import { apiJson } from "./http";
import { PROCUREMENT_API, PROCUREMENT_KEY } from "./procurement-access";
import { postJson } from "./stores";

export type MaterialRequest =
  ConstructionProcurementMaterialRequestResponseModel;
export type MaterialRequestStatus = MaterialRequest["status"];
export type MaterialRequestPage =
  ListConstructionProcurementMaterialRequestsResponseModel;
export type MaterialRequestFormOptions =
  GetConstructionProcurementMaterialRequestFormOptionsResponseModel;

export const MATERIAL_REQUESTS_API = `${PROCUREMENT_API}/material-requests`;
export const MATERIAL_REQUESTS_KEY = [
  ...PROCUREMENT_KEY,
  "material-requests",
] as const;

export const MATERIAL_REQUEST_STATUS_LABELS: Record<
  MaterialRequestStatus,
  string
> = {
  requested: "Requested",
  partially_delivered: "Partially delivered",
  delivered: "Delivered",
  closed: "Closed",
};

export type MaterialRequestFilter = {
  projectId?: string;
  storeId?: string;
  status?: MaterialRequestStatus;
  cursor?: { after?: string; before?: string };
};

export function materialRequestsQuery(filter: MaterialRequestFilter) {
  const query = new URLSearchParams({ limit: "25" });
  if (filter.projectId != null) query.set("projectId", filter.projectId);
  if (filter.storeId != null) query.set("storeId", filter.storeId);
  if (filter.status != null) query.set("status", filter.status);
  if (filter.cursor?.after != null) query.set("after", filter.cursor.after);
  if (filter.cursor?.before != null) query.set("before", filter.cursor.before);
  const search = query.toString();
  return queryOptions({
    queryKey: [...MATERIAL_REQUESTS_KEY, "list", search] as const,
    queryFn: () =>
      apiJson<MaterialRequestPage>(`${MATERIAL_REQUESTS_API}?${search}`),
  });
}

export function materialRequestQuery(id: string) {
  return queryOptions({
    queryKey: [...MATERIAL_REQUESTS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<MaterialRequest>(
        `${MATERIAL_REQUESTS_API}/${encodeURIComponent(id)}`,
      ),
  });
}

export function materialRequestFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...MATERIAL_REQUESTS_KEY, "form-options", projectId] as const,
    queryFn: () =>
      apiJson<MaterialRequestFormOptions>(
        `${MATERIAL_REQUESTS_API}/form-options?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

export function materialRequestPdfUrl(id: string): string {
  return `${MATERIAL_REQUESTS_API}/${encodeURIComponent(id)}/pdf`;
}

export type MaterialRequestInput = {
  requestDate: string;
  storeId: string;
  contractorId: string | null;
  departmentId: string | null;
  siteLocation: LocationRefInput | null;
  receiverName: string | null;
  remark: string | null;
  items: { materialId: string; askQty: string; remark: string | null }[];
};

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: PROCUREMENT_KEY });
}

export function useCreateMaterialRequest(projectId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: MaterialRequestInput) =>
      postJson<MaterialRequest>(MATERIAL_REQUESTS_API, { projectId, ...input }),
    onSuccess: invalidate,
  });
}

export function useUpdateMaterialRequest(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: MaterialRequestInput & { expectedUpdatedAt: string }) =>
      postJson<MaterialRequest>(
        `${MATERIAL_REQUESTS_API}/${encodeURIComponent(id)}/update`,
        input,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteMaterialRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (request: { id: string; updatedAt: string }) =>
      postJson<undefined>(
        `${MATERIAL_REQUESTS_API}/${encodeURIComponent(request.id)}/delete`,
        { expectedUpdatedAt: request.updatedAt },
      ),
    onSuccess: invalidate,
  });
}

export function useCloseMaterialRequest() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: { id: string; updatedAt: string; reason: string }) =>
      postJson<MaterialRequest>(
        `${MATERIAL_REQUESTS_API}/${encodeURIComponent(input.id)}/close`,
        { reason: input.reason, expectedUpdatedAt: input.updatedAt },
      ),
    onSuccess: invalidate,
  });
}
