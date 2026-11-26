import { queryOptions } from "@tanstack/react-query";

import type {
  CentreDetailsInput,
  FranchiseInput,
} from "@/src/preschool/application/centre-handlers";
import type {
  CentreListView,
  CentreView,
} from "@/src/preschool/application/centre-views";

import { apiJson } from "../http";
import { preschoolKeys } from "./me";

export type PreschoolCentre = CentreView;
export type PreschoolCentreDetailsInput = CentreDetailsInput;
export type PreschoolCentreFranchiseInput = FranchiseInput;
export type PreschoolCentreCreateInput = CentreDetailsInput & FranchiseInput;

/**
 * Centres. A write changes `/api/preschool/me` too (names, codes, status),
 * so writes invalidate `preschoolKeys.all`.
 */
export const preschoolCentreQueries = {
  key: {
    all: [...preschoolKeys.all, "centres"] as const,
    list: () => [...preschoolCentreQueries.key.all, "list"] as const,
    detail: (id: string) =>
      [...preschoolCentreQueries.key.all, "detail", id] as const,
  },
  list: () =>
    queryOptions({
      queryKey: preschoolCentreQueries.key.list(),
      queryFn: () => apiJson<CentreListView>("/api/preschool/centres"),
    }),
  detail: (id: string) =>
    queryOptions({
      queryKey: preschoolCentreQueries.key.detail(id),
      queryFn: () =>
        apiJson<CentreView>(`/api/preschool/centres/${encodeURIComponent(id)}`),
    }),
};

function postJson(path: string, body?: unknown): Promise<CentreView> {
  return apiJson<CentreView>(path, {
    method: "POST",
    ...(body === undefined
      ? {}
      : {
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
}

const centrePath = (id: string, operation: string) =>
  `/api/preschool/centres/${encodeURIComponent(id)}/${operation}`;

export function createPreschoolCentre(
  input: PreschoolCentreCreateInput,
): Promise<CentreView> {
  return postJson("/api/preschool/centres", input);
}

export function updatePreschoolCentreDetails(
  id: string,
  input: PreschoolCentreDetailsInput,
): Promise<CentreView> {
  return postJson(centrePath(id, "details"), input);
}

export function updatePreschoolCentreFranchise(
  id: string,
  input: PreschoolCentreFranchiseInput,
): Promise<CentreView> {
  return postJson(centrePath(id, "franchise"), input);
}

export function closePreschoolCentre(id: string): Promise<CentreView> {
  return postJson(centrePath(id, "close"));
}

export function reopenPreschoolCentre(id: string): Promise<CentreView> {
  return postJson(centrePath(id, "reopen"));
}
