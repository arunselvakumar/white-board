import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionMastersContractorResponseModel,
  CreateConstructionMastersContractorRequestModel,
  ListConstructionMastersContractorsResponseModel,
  UpdateConstructionMastersContractorRequestModel,
} from "@/app/api/construction/masters/contractors/contractor-models";

import { apiJson } from "./http";

/** Which party master: Contractors or Suppliers (CM-406). */
export type PartyList = "contractors" | "suppliers";

/**
 * A Contractor or Supplier as the API returns it. The two share one shape;
 * a Supplier's `departments` is always empty.
 */
export type Party = ConstructionMastersContractorResponseModel;
export type PartyPage = ListConstructionMastersContractorsResponseModel;
/** Add form; Suppliers ignore `departmentIds`. */
export type PartyInput = CreateConstructionMastersContractorRequestModel;
export type PartyUpdateInput = UpdateConstructionMastersContractorRequestModel;

const BASE = "/api/construction/masters";

/** Every party query key starts here, so one invalidation covers a list. */
export const PARTIES_KEY = ["masters", "parties"] as const;

export type PartyListFilter = {
  search: string;
  status: "all" | "active" | "inactive";
  cursor: { after: string } | { before: string } | null;
};

export function partiesQuery(list: PartyList, filter: PartyListFilter) {
  const params = new URLSearchParams({ limit: "25" });
  if (filter.search.trim().length > 0) params.set("q", filter.search.trim());
  if (filter.status !== "all")
    params.set("active", filter.status === "active" ? "true" : "false");
  if (filter.cursor != null) {
    if ("after" in filter.cursor) params.set("after", filter.cursor.after);
    else params.set("before", filter.cursor.before);
  }
  return queryOptions({
    queryKey: [...PARTIES_KEY, list, "list", params.toString()],
    queryFn: () => apiJson<PartyPage>(`${BASE}/${list}?${params.toString()}`),
  });
}

export function partyQuery(list: PartyList, id: string) {
  return queryOptions({
    queryKey: [...PARTIES_KEY, list, "detail", id],
    queryFn: () => apiJson<Party>(`${BASE}/${list}/${encodeURIComponent(id)}`),
  });
}

function postJson<T>(url: string, body?: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
}

function itemUrl(list: PartyList, id: string, verb: string): string {
  return `${BASE}/${list}/${encodeURIComponent(id)}/${verb}`;
}

export function useCreateParty(list: PartyList) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PartyInput) =>
      postJson<Party>(`${BASE}/${list}`, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: [...PARTIES_KEY, list] }),
  });
}

export function useUpdateParty(list: PartyList, id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: PartyUpdateInput) =>
      postJson<Party>(itemUrl(list, id, "update"), input),
    onSuccess: async (updated) => {
      queryClient.setQueryData(partyQuery(list, id).queryKey, updated);
      await queryClient.invalidateQueries({ queryKey: [...PARTIES_KEY, list] });
    },
  });
}

export type PartyCommand = {
  kind: "activate" | "deactivate" | "delete";
  id: string;
};

/** Activate, Deactivate or Delete from the list's row menu. */
export function usePartyCommand(list: PartyList) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (command: PartyCommand) =>
      postJson<Party | undefined>(itemUrl(list, command.id, command.kind)),
    onSettled: () =>
      queryClient.invalidateQueries({ queryKey: [...PARTIES_KEY, list] }),
  });
}
