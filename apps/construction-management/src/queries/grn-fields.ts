import { queryOptions } from "@tanstack/react-query";

import type {
  GetConstructionOrganizationGrnFieldSettingResponseModel,
  UpdateConstructionOrganizationGrnFieldSettingRequestModel,
} from "@/app/api/construction/organization/settings/grn-fields/grn-field-setting-models";

import { apiJson } from "./http";

const BASE = "/api/construction/organization/settings/grn-fields";

export type GrnFieldSettingData =
  GetConstructionOrganizationGrnFieldSettingResponseModel;

/** Which optional GRN fields the Company hides (Settings → GRN fields). */
export const grnFieldSettingQuery = queryOptions({
  queryKey: ["organization", "settings", "grn-fields"],
  queryFn: () => apiJson<GrnFieldSettingData>(BASE),
});

export function updateGrnFieldSetting(
  input: UpdateConstructionOrganizationGrnFieldSettingRequestModel,
): Promise<GrnFieldSettingData> {
  return apiJson(`${BASE}/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
