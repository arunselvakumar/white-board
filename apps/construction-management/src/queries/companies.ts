import { queryOptions } from "@tanstack/react-query";

import type { CreateConstructionOrganizationCompanyRequestModel } from "@/app/api/construction/organization/companies/create-company-request-model";
import type { CreateConstructionOrganizationCompanyResponseModel } from "@/app/api/construction/organization/companies/create-company-response-model";
import type { ListMyConstructionOrganizationCompaniesResponseModel } from "@/app/api/construction/organization/companies/me/list-my-companies-response-model";

import { apiJson } from "./http";

const BASE = "/api/construction/organization/companies";

export const myCompaniesQuery = queryOptions({
  queryKey: ["organization", "companies", "me"],
  queryFn: () =>
    apiJson<ListMyConstructionOrganizationCompaniesResponseModel>(`${BASE}/me`),
});

export function createCompany(
  input: CreateConstructionOrganizationCompanyRequestModel,
): Promise<CreateConstructionOrganizationCompanyResponseModel> {
  return apiJson(BASE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function switchCompany(
  id: string,
): Promise<{ activeCompanyId: string }> {
  return apiJson(`${BASE}/${encodeURIComponent(id)}/switch`, {
    method: "POST",
  });
}
