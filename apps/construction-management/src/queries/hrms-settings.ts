import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionHrmsSettingsResponseModel } from "@/app/api/construction/hrms/settings/get-hrms-settings-response-model";
import type { UpdateConstructionHrmsSettingsRequestModel } from "@/app/api/construction/hrms/settings/update/update-hrms-settings-request-model";
import type { UpdateConstructionHrmsSettingsResponseModel } from "@/app/api/construction/hrms/settings/update/update-hrms-settings-response-model";

import { apiJson } from "./http";

/**
 * Every hrms query key starts here, so one invalidation can cover the
 * context. Each M3 screen adds its own `src/queries/hrms-<area>.ts` with
 * keys under `[...HRMS_KEY, "<area>"]`.
 */
export const HRMS_KEY = ["hrms"] as const;

const SETTINGS = "/api/construction/hrms/settings";

export type HrmsSettingsModel = GetConstructionHrmsSettingsResponseModel;

/** The Company's HRMS Settings (CM-303); `updatedAt` null = never saved. */
export const hrmsSettingsQuery = queryOptions({
  queryKey: [...HRMS_KEY, "settings"],
  queryFn: () => apiJson<HrmsSettingsModel>(SETTINGS),
});

export function updateHrmsSettings(
  input: UpdateConstructionHrmsSettingsRequestModel,
): Promise<UpdateConstructionHrmsSettingsResponseModel> {
  return apiJson(`${SETTINGS}/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}
