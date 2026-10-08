import { queryOptions } from "@tanstack/react-query";

import type { ConstructionOrganizationTeamMemberResponseModel } from "@/app/api/construction/organization/team-members/team-member-models";
import type { ListConstructionOrganizationTeamMembersResponseModel } from "@/app/api/construction/organization/team-members/list-team-members-response-model";
import type { PermissionGrants } from "@/src/shared-kernel/access";

import { apiJson } from "./http";

const BASE = "/api/construction/organization/team-members";

export type TeamMember = ConstructionOrganizationTeamMemberResponseModel;
export type TeamMemberStatus = TeamMember["status"];

export type TeamMemberListFilter = {
  search: string;
  status: TeamMemberStatus | "all";
  cursor: { after: string } | { before: string } | null;
};

export function teamMembersQuery(filter: TeamMemberListFilter) {
  const params = new URLSearchParams({ limit: "25" });
  if (filter.search.trim().length > 0)
    params.set("search", filter.search.trim());
  if (filter.status !== "all") params.set("status", filter.status);
  if (filter.cursor != null) {
    if ("after" in filter.cursor) params.set("after", filter.cursor.after);
    else params.set("before", filter.cursor.before);
  }
  return queryOptions({
    queryKey: ["organization", "team-members", "list", params.toString()],
    queryFn: () =>
      apiJson<ListConstructionOrganizationTeamMembersResponseModel>(
        `${BASE}?${params.toString()}`,
      ),
  });
}

export function teamMemberQuery(id: string) {
  return queryOptions({
    queryKey: ["organization", "team-members", "one", id],
    queryFn: () => apiJson<TeamMember>(`${BASE}/${encodeURIComponent(id)}`),
  });
}

export const TEAM_MEMBERS_KEY = ["organization", "team-members"] as const;

export type TeamMemberDetailsInput = {
  name: string;
  designationId: string;
  mobile: string | null;
  email: string | null;
  address: string | null;
  aadhaar?: string | null;
  pan?: string | null;
  emergencyContact: string | null;
  memberType: "normal" | "hrms";
};

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

export function createTeamMember(
  input: TeamMemberDetailsInput & {
    projectIds: string[];
    permissions?: PermissionGrants;
  },
): Promise<TeamMember> {
  return post("", input);
}

export function updateTeamMember(id: string, input: TeamMemberDetailsInput) {
  return post<TeamMember>(`/${encodeURIComponent(id)}/update`, input);
}

export function setTeamMemberPermissions(
  id: string,
  permissions: PermissionGrants,
) {
  return post<TeamMember>(`/${encodeURIComponent(id)}/permissions`, {
    permissions,
  });
}

export function assignTeamMemberProjects(id: string, projectIds: string[]) {
  return post<TeamMember>(`/${encodeURIComponent(id)}/projects`, {
    projectIds,
  });
}

export function resendTeamMemberInvite(id: string) {
  return post<TeamMember>(`/${encodeURIComponent(id)}/resend-invite`);
}

export function removeTeamMember(id: string) {
  return post<undefined>(`/${encodeURIComponent(id)}/remove`);
}

export function revealTeamMemberIds(id: string) {
  return post<{ aadhaar: string | null; pan: string | null }>(
    `/${encodeURIComponent(id)}/reveal`,
  );
}
