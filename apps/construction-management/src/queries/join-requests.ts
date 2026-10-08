import { queryOptions } from "@tanstack/react-query";

import type { ListConstructionOrganizationJoinRequestsResponseModel } from "@/app/api/construction/organization/join-requests/join-request-models";

import { apiJson } from "./http";

const BASE = "/api/construction/organization/join-requests";

export const joinRequestsQuery = queryOptions({
  queryKey: ["organization", "join-requests"],
  queryFn: () =>
    apiJson<ListConstructionOrganizationJoinRequestsResponseModel>(BASE),
});

export function acceptJoinRequest(id: string): Promise<{ companyId: string }> {
  return apiJson(`${BASE}/${encodeURIComponent(id)}/accept`, {
    method: "POST",
  });
}

export function rejectJoinRequest(id: string): Promise<void> {
  return apiJson(`${BASE}/${encodeURIComponent(id)}/reject`, {
    method: "POST",
  });
}
