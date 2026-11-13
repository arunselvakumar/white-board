import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type { ReassignConstructionMarketingProspectCompanyRequestModel } from "@/app/api/construction/marketing/companies/company-models";
import type {
  GetConstructionMarketingNeedsReassigningResponseModel,
  GetConstructionMarketingTeamResponseModel,
} from "@/app/api/construction/marketing/team/team-models";
import {
  MARKETING_COMPANIES_PATH,
  MARKETING_FOLLOW_UPS_PATH,
  MARKETING_VISITS_PATH,
} from "@/lib/marketing-nav";

import { apiJson, QueryHttpError } from "./http";
import {
  companyQuery,
  MARKETING_COMPANIES_API,
  MARKETING_COMPANIES_KEY,
  type ProspectCompany,
} from "./marketing-companies";
import { MARKETING_FOLLOW_UPS_KEY } from "./marketing-follow-ups";

export type MarketingTeam = z.infer<
  typeof GetConstructionMarketingTeamResponseModel
>;
export type MarketingTeamPerson = MarketingTeam["people"][number];
export type NeedsReassigning = z.infer<
  typeof GetConstructionMarketingNeedsReassigningResponseModel
>;
export type ReassignInput = z.input<
  typeof ReassignConstructionMarketingProspectCompanyRequestModel
>;

export const MARKETING_TEAM_API = "/api/construction/marketing/team";
export const NEEDS_REASSIGNING_API = `${MARKETING_COMPANIES_API}/needs-reassigning`;
export const NEEDS_REASSIGNING_PATH = `${MARKETING_COMPANIES_PATH}/needs-reassigning`;

/** The Team read; a target change answers it. */
export const MARKETING_TEAM_KEY = ["marketing", "team"] as const;

/** Marketing People with this month's Visits against target. */
export const teamQuery = queryOptions({
  queryKey: MARKETING_TEAM_KEY,
  queryFn: ({ meta }) =>
    apiJson<MarketingTeam>(MARKETING_TEAM_API, undefined, meta),
});

/**
 * Companies and open Follow-ups whose person is no longer active. Kept
 * under the companies key, so company and Follow-up writes refresh it.
 */
export const needsReassigningQuery = queryOptions({
  queryKey: [...MARKETING_COMPANIES_KEY, "needs-reassigning"],
  queryFn: ({ meta }) =>
    apiJson<NeedsReassigning>(NEEDS_REASSIGNING_API, undefined, meta),
});

/** Add Staff, with the Marketing Role picked when there is one. */
export function addMarketingPersonPath(roleId: string | null): string {
  const base = "/app/staff/office-staff/new";
  return roleId == null ? base : `${base}?roleId=${encodeURIComponent(roleId)}`;
}

/** A person's Visits, filtered to them. */
export function personVisitsPath(memberId: string): string {
  return `${MARKETING_VISITS_PATH}?memberId=${encodeURIComponent(memberId)}`;
}

/** A person's Follow-ups, Everyone filtered to them (View all only). */
export function personFollowUpsPath(memberId: string): string {
  return `${MARKETING_FOLLOW_UPS_PATH}?owner=${encodeURIComponent(memberId)}`;
}

function post<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function useSetVisitTarget(memberId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (target: number | null) =>
      post<MarketingTeam>(
        `${MARKETING_TEAM_API}/${encodeURIComponent(memberId)}/target`,
        { target },
      ),
    onSuccess: (team) => {
      client.setQueryData(teamQuery.queryKey, team);
    },
  });
}

/**
 * Reassign moves the company and its open Follow-ups: the company's page
 * keeps the answer; the lists, Follow-ups, needs-reassigning and the Team
 * (overdue counts) refresh.
 */
export function useReassignCompany(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: ReassignInput) =>
      post<ProspectCompany>(
        `${MARKETING_COMPANIES_API}/${encodeURIComponent(id)}/reassign`,
        input,
      ),
    onSuccess: async (company) => {
      client.setQueryData(companyQuery(company.id).queryKey, company);
      await Promise.all([
        client.invalidateQueries({
          queryKey: MARKETING_COMPANIES_KEY,
          predicate: (query) => query.queryKey[2] !== "detail",
        }),
        client.invalidateQueries({
          queryKey: MARKETING_FOLLOW_UPS_KEY,
          predicate: (query) => query.queryKey[2] !== "form-options",
        }),
        client.invalidateQueries({ queryKey: MARKETING_TEAM_KEY }),
      ]);
    },
  });
}

/** What to say for a failed Reassign or target change. */
export function teamErrorMessage(error: unknown): string {
  if (error instanceof QueryHttpError) {
    if (error.code.endsWith("_CHANGED"))
      return "Someone else changed this Prospect Company after you opened it. Reload the page to see their changes, then try again.";
    return error.message;
  }
  return "Something went wrong. Please try again.";
}
