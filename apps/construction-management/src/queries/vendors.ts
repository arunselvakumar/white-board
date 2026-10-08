import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { UpdateConstructionLabourVendorRequestModel } from "@/app/api/construction/labour/vendors/[id]/update/update-vendor-request-model";
import type { CreateConstructionLabourVendorRequestModel } from "@/app/api/construction/labour/vendors/create-vendor-request-model";
import type { ListConstructionLabourVendorsResponseModel } from "@/app/api/construction/labour/vendors/list-vendors-response-model";
import type { ListConstructionLabourVendorOptionsResponseModel } from "@/app/api/construction/labour/vendors/options/list-vendor-options-response-model";
import type {
  ConstructionLabourVendorResponseModel,
  ConstructionLabourVendorSummaryResponseModel,
} from "@/app/api/construction/labour/vendors/vendor-models";

import { apiJson } from "./http";

export type VendorResponse = ConstructionLabourVendorResponseModel;
export type VendorSummary = ConstructionLabourVendorSummaryResponseModel;
export type VendorList = ListConstructionLabourVendorsResponseModel;
export type VendorInput = CreateConstructionLabourVendorRequestModel;
export type VendorUpdateInput = UpdateConstructionLabourVendorRequestModel;
export type VendorOption =
  ListConstructionLabourVendorOptionsResponseModel["items"][number];

export const VENDORS_API = "/api/construction/labour/vendors";

/** Every Vendor query key starts here, so one invalidation covers them. */
export const VENDORS_KEY = ["labour", "vendors"] as const;

export type VendorListFilter = {
  search: string;
  status: "all" | "active" | "inactive";
  projectId: string | null;
  cursor: { after: string } | { before: string } | null;
};

export function vendorsQuery(filter: VendorListFilter) {
  const params = new URLSearchParams({ limit: "25" });
  if (filter.search.trim().length > 0) params.set("q", filter.search.trim());
  if (filter.status !== "all")
    params.set("active", filter.status === "active" ? "true" : "false");
  if (filter.projectId != null) params.set("projectId", filter.projectId);
  if (filter.cursor != null) {
    if ("after" in filter.cursor) params.set("after", filter.cursor.after);
    else params.set("before", filter.cursor.before);
  }
  return queryOptions({
    queryKey: [...VENDORS_KEY, "list", params.toString()],
    queryFn: () => apiJson<VendorList>(`${VENDORS_API}?${params.toString()}`),
  });
}

export function vendorQuery(id: string) {
  return queryOptions({
    queryKey: [...VENDORS_KEY, "detail", id],
    queryFn: () =>
      apiJson<VendorResponse>(`${VENDORS_API}/${encodeURIComponent(id)}`),
  });
}

/** Active vendors on a Project with their rate cards (vendor attendance). */
export function vendorOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...VENDORS_KEY, "options", projectId],
    queryFn: () =>
      apiJson<ListConstructionLabourVendorOptionsResponseModel>(
        `${VENDORS_API}/options?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function itemUrl(id: string, verb: string): string {
  return `${VENDORS_API}/${encodeURIComponent(id)}/${verb}`;
}

export function createVendor(input: VendorInput): Promise<VendorResponse> {
  return postJson(VENDORS_API, input);
}

export function updateVendor(
  id: string,
  input: VendorUpdateInput,
): Promise<VendorResponse> {
  return postJson(itemUrl(id, "update"), input);
}

export type VendorCommand = {
  kind: "activate" | "deactivate" | "delete";
  id: string;
};

export function runVendorCommand(
  command: VendorCommand,
): Promise<VendorResponse | undefined> {
  return postJson(itemUrl(command.id, command.kind));
}

function useInvalidateVendors() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: VENDORS_KEY });
}

export function useCreateVendor() {
  const invalidate = useInvalidateVendors();
  return useMutation({ mutationFn: createVendor, onSuccess: invalidate });
}

export function useUpdateVendor(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: VendorUpdateInput) => updateVendor(id, input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(vendorQuery(id).queryKey, updated);
      await queryClient.invalidateQueries({ queryKey: VENDORS_KEY });
    },
  });
}

/** Activate, Deactivate or Delete from the list's row menu. */
export function useVendorCommand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runVendorCommand,
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [...VENDORS_KEY, "list"] }),
  });
}
