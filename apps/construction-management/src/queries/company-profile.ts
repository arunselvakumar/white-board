import { queryOptions } from "@tanstack/react-query";

import type { GetConstructionOrganizationCompanyProfileResponseModel } from "@/app/api/construction/organization/company-profile/get-company-profile-response-model";
import type { UpdateConstructionOrganizationCompanyProfileRequestModel } from "@/app/api/construction/organization/company-profile/update/update-company-profile-request-model";

import { apiJson, QueryHttpError } from "./http";

const BASE = "/api/construction/organization/company-profile";

export type CompanyProfileModel =
  GetConstructionOrganizationCompanyProfileResponseModel;

/**
 * The Company profile, or null when the caller may not read Settings: the
 * screen explains that instead of failing.
 */
export const companyProfileQuery = queryOptions({
  queryKey: ["organization", "company-profile"],
  queryFn: async (): Promise<CompanyProfileModel | null> => {
    try {
      return await apiJson<CompanyProfileModel>(BASE);
    } catch (error) {
      if (error instanceof QueryHttpError && error.code === "PERMISSION_DENIED")
        return null;
      throw error;
    }
  },
});

export function updateCompanyProfile(
  input: UpdateConstructionOrganizationCompanyProfileRequestModel,
): Promise<CompanyProfileModel> {
  return apiJson(`${BASE}/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

/** The file itself is the body; the server checks type and size again. */
export function uploadCompanyLogo(file: File): Promise<CompanyProfileModel> {
  return apiJson(`${BASE}/logo`, {
    method: "POST",
    headers: { "content-type": file.type },
    body: file,
  });
}

export function removeCompanyLogo(): Promise<CompanyProfileModel> {
  return apiJson(`${BASE}/logo/remove`, { method: "POST" });
}
