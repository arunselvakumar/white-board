import { queryOptions } from "@tanstack/react-query";

import type { MeView } from "@/src/preschool/application/me";

import { apiJson } from "../http";

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
  });
}
