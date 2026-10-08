import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/get-backdated-entry-policy-response-model";
import type { UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel } from "@/app/api/construction/organization/settings/backdated-entry/update/update-backdated-entry-policy-request-model";
import type { UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel } from "@/app/api/construction/organization/settings/backdated-entry/update/update-backdated-entry-policy-response-model";

import { apiJson } from "./http";

const SETTINGS = "/api/construction/organization/settings";

/** Designations as Settings needs them: id and name only. */
export type DesignationOption = { id: string; name: string };

/**
 * The Company's Designations for override pickers. The Designations route
 * is owned by the Designations screens (CM-112); Settings reads only
 * `items[].id` and `items[].name`.
 */
export const designationOptionsQuery = queryOptions({
  queryKey: ["organization", "designations", "options"],
  queryFn: async (): Promise<DesignationOption[]> => {
    const body = await apiJson<{ items: DesignationOption[] }>(
      "/api/construction/organization/designations",
    );
    return body.items.map((item) => ({ id: item.id, name: item.name }));
  },
});

export const backdatedEntryPolicyQuery = queryOptions({
  queryKey: ["organization", "settings", "backdated-entry"],
  queryFn: () =>
    apiJson<GetConstructionOrganizationBackdatedEntryPolicyResponseModel>(
      `${SETTINGS}/backdated-entry`,
    ),
});

export function updateBackdatedEntryPolicy(
  input: UpdateConstructionOrganizationBackdatedEntryPolicyRequestModel,
): Promise<UpdateConstructionOrganizationBackdatedEntryPolicyResponseModel> {
  return apiJson(`${SETTINGS}/backdated-entry/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
