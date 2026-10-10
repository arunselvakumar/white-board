import { queryOptions } from "@tanstack/react-query";

import type {
  ConstructionHrmsBranchResponseModel,
  CreateConstructionHrmsBranchRequestModel,
  ListConstructionHrmsBranchesResponseModel,
  ListConstructionHrmsProjectSitesResponseModel,
  SetConstructionHrmsBranchMembersRequestModel,
  UpdateConstructionHrmsBranchRequestModel,
} from "@/app/api/construction/hrms/branches/branch-models";

import { HRMS_KEY } from "./hrms-settings";
import { apiJson } from "./http";

const BRANCHES = "/api/construction/hrms/branches";

export const HRMS_BRANCHES_KEY = [...HRMS_KEY, "branches"] as const;

export type HrmsBranch = ConstructionHrmsBranchResponseModel;
export type HrmsBranchList = ListConstructionHrmsBranchesResponseModel;
export type HrmsBranchEmployee = HrmsBranchList["employees"][number];
export type HrmsProjectSites = ListConstructionHrmsProjectSitesResponseModel;

/** Office branches and site fences, with linkable Team Members (CM-304). */
export const hrmsBranchesQuery = queryOptions({
  queryKey: HRMS_BRANCHES_KEY,
  queryFn: () => apiJson<HrmsBranchList>(BRANCHES),
});

/** Every Project with its site fence or null, for the site picker. */
export const hrmsProjectSitesQuery = queryOptions({
  queryKey: [...HRMS_BRANCHES_KEY, "project-sites"],
  queryFn: () => apiJson<HrmsProjectSites>(`${BRANCHES}/project-sites`),
});

function post<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function createHrmsBranch(
  input: CreateConstructionHrmsBranchRequestModel,
): Promise<HrmsBranch> {
  return post(BRANCHES, input);
}

export function updateHrmsBranch(
  id: string,
  input: UpdateConstructionHrmsBranchRequestModel,
): Promise<HrmsBranch> {
  return post(`${BRANCHES}/${id}/update`, input);
}

export function removeHrmsBranch(id: string): Promise<void> {
  return post(`${BRANCHES}/${id}/remove`, {});
}

export function setHrmsBranchMembers(
  id: string,
  input: SetConstructionHrmsBranchMembersRequestModel,
): Promise<HrmsBranch> {
  return post(`${BRANCHES}/${id}/members`, input);
}
