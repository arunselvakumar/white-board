import { queryOptions } from "@tanstack/react-query";

import type {
  ConstructionOrganizationTeamMemberResponseModel,
  ConstructionOrganizationTeamMemberWithPasswordResponseModel,
} from "@/app/api/construction/organization/team-members/team-member-models";
import type { ListConstructionOrganizationTeamMembersResponseModel } from "@/app/api/construction/organization/team-members/list-team-members-response-model";

import { apiJson } from "./http";

const BASE = "/api/construction/organization/team-members";

export type TeamMember = ConstructionOrganizationTeamMemberResponseModel;
export type TeamMemberStatus = TeamMember["status"];
export type TeamMemberList =
  ListConstructionOrganizationTeamMembersResponseModel;

/**
 * Setting a password never touches an account someone already has: the
 * person got a Join Request instead (ADR CM-0030 §3).
 */
export type PasswordOutcome = Pick<
  ConstructionOrganizationTeamMemberWithPasswordResponseModel,
  "passwordIgnored"
>;

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
    queryFn: () => apiJson<TeamMemberList>(`${BASE}?${params.toString()}`),
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
  /** Paise a month; left out keeps it, null clears it (ADR CM-0032). */
  monthlySalary?: number | null;
  memberType: "normal" | "hrms";
};

function post<T>(path: string, body?: unknown): Promise<T> {
  return apiJson<T>(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/**
 * Add Staff (ADR CM-0030 §6): `password` set signs them up at once (`invite`
 * is ignored then); otherwise `invite` emails them the Join Request.
 */
export function createTeamMember(
  input: TeamMemberDetailsInput & {
    projectIds: string[];
    roleId: string;
    invite: boolean;
    password: string | null;
  },
): Promise<TeamMember & PasswordOutcome> {
  return post("", input);
}

export function updateTeamMember(id: string, input: TeamMemberDetailsInput) {
  return post<TeamMember>(`/${encodeURIComponent(id)}/update`, input);
}

/** Puts the Team Member on another Role (ADR CM-0030 §1). */
export function setTeamMemberRole(id: string, roleId: string) {
  return apiJson<TeamMember>(`${BASE}/${encodeURIComponent(id)}/role`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ roleId }),
  });
}

/** A Temporary Password; they change it the next time they sign in. */
export function setTeamMemberPassword(id: string, password: string) {
  return post<TeamMember & PasswordOutcome>(
    `/${encodeURIComponent(id)}/password`,
    { password },
  );
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

export type DesignationOption = { id: string; name: string };

/** Designations for the Team Member form (the route is CM-112's). */
export const designationOptionsQuery = queryOptions({
  queryKey: ["organization", "designations", "options"],
  queryFn: async () =>
    (
      await apiJson<{ items: DesignationOption[] }>(
        "/api/construction/organization/designations",
      )
    ).items,
});
