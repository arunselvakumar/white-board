import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { DuplicateConstructionOrganizationDesignationRequestModel } from "@/app/api/construction/organization/designations/[id]/duplicate/duplicate-designation-request-model";
import type { UpdateConstructionOrganizationDesignationRequestModel } from "@/app/api/construction/organization/designations/[id]/update/update-designation-request-model";
import type { CreateConstructionOrganizationDesignationRequestModel } from "@/app/api/construction/organization/designations/create-designation-request-model";
import type { ConstructionOrganizationDesignationResponseModel } from "@/app/api/construction/organization/designations/designation-response-model";
import type { ListConstructionOrganizationDesignationsResponseModel } from "@/app/api/construction/organization/designations/list-designations-response-model";

import { apiJson } from "./http";

export type DesignationResponse =
  ConstructionOrganizationDesignationResponseModel;

const BASE = "/api/construction/organization/designations";

/** Every Designation query key starts here, so one invalidation covers them. */
const DESIGNATIONS_KEY = ["organization", "designations"] as const;

export const designationsQuery = queryOptions({
  queryKey: [...DESIGNATIONS_KEY, "list"],
  queryFn: () =>
    apiJson<ListConstructionOrganizationDesignationsResponseModel>(BASE),
});

export function designationQuery(id: string) {
  return queryOptions({
    queryKey: [...DESIGNATIONS_KEY, "detail", id],
    queryFn: () =>
      apiJson<DesignationResponse>(`${BASE}/${encodeURIComponent(id)}`),
  });
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

export function createDesignation(
  input: CreateConstructionOrganizationDesignationRequestModel,
): Promise<DesignationResponse> {
  return postJson(BASE, input);
}

export function updateDesignation(
  id: string,
  input: UpdateConstructionOrganizationDesignationRequestModel,
): Promise<DesignationResponse> {
  return postJson(`${BASE}/${encodeURIComponent(id)}/update`, input);
}

export function duplicateDesignation(
  id: string,
  input: DuplicateConstructionOrganizationDesignationRequestModel = {},
): Promise<DesignationResponse> {
  return postJson(`${BASE}/${encodeURIComponent(id)}/duplicate`, input);
}

export function deleteDesignation(id: string): Promise<void> {
  return postJson(`${BASE}/${encodeURIComponent(id)}/delete`);
}

function useInvalidateDesignations() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: DESIGNATIONS_KEY });
}

export function useCreateDesignation() {
  const invalidate = useInvalidateDesignations();
  return useMutation({ mutationFn: createDesignation, onSuccess: invalidate });
}

export function useUpdateDesignation(id: string) {
  const invalidate = useInvalidateDesignations();
  return useMutation({
    mutationFn: (
      input: UpdateConstructionOrganizationDesignationRequestModel,
    ) => updateDesignation(id, input),
    onSuccess: invalidate,
  });
}

export function useDuplicateDesignation() {
  const invalidate = useInvalidateDesignations();
  return useMutation({
    mutationFn: (id: string) => duplicateDesignation(id),
    onSuccess: invalidate,
  });
}

export function useDeleteDesignation() {
  const invalidate = useInvalidateDesignations();
  return useMutation({ mutationFn: deleteDesignation, onSuccess: invalidate });
}
