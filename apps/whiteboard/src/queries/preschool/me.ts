import { queryOptions } from "@tanstack/react-query";

import type { MeView } from "@/src/preschool/application/me";

import { apiJson, QueryHttpError } from "../http";

export type PreschoolMe = MeView;
export type PreschoolRole = MeView["role"];

export const preschoolKeys = {
  all: ["preschool"] as const,
  me: () => [...preschoolKeys.all, "me"] as const,
};

export function preschoolMeQueryOptions() {
  return queryOptions({
    queryKey: preschoolKeys.me(),
    queryFn: ({ meta }) => apiJson<PreschoolMe>("/api/preschool/me", {}, meta),
    staleTime: 60_000,
    // A 4xx (NOT_A_PRESCHOOL, no access) will not change by asking again.
    retry: (failures, error) =>
      !(error instanceof QueryHttpError && error.status < 500) && failures < 3,
  });
}

/** True when `/api/preschool/me` said the Workspace has no Preschool setup yet. */
export function isNotAPreschool(error: unknown): boolean {
  return error instanceof QueryHttpError && error.code === "NOT_A_PRESCHOOL";
}
