import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionMastersClientOptionModel,
  ConstructionMastersClientResponseModel,
  CreateConstructionMastersClientRequestModel,
  ListConstructionMastersClientOptionsResponseModel,
  ListConstructionMastersClientsResponseModel,
} from "@/app/api/construction/masters/clients/client-models";

import { apiJson } from "./http";

export type Client = ConstructionMastersClientResponseModel;
export type ClientPage = ListConstructionMastersClientsResponseModel;
export type ClientInput = CreateConstructionMastersClientRequestModel;
export type ClientOption = ConstructionMastersClientOptionModel;

export const CLIENTS_API = "/api/construction/masters/clients";

/** Every Client query key starts here (CM-1101). */
export const CLIENTS_KEY = ["masters", "clients"] as const;

export type ClientListFilter = {
  search: string;
  cursor: { after: string } | { before: string } | null;
};

export function clientsQuery(filter: ClientListFilter) {
  const query = new URLSearchParams();
  const search = filter.search.trim();
  if (search !== "") query.set("q", search);
  if (filter.cursor != null) {
    if ("after" in filter.cursor) query.set("after", filter.cursor.after);
    else query.set("before", filter.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...CLIENTS_KEY, "list", text] as const,
    queryFn: () =>
      apiJson<ClientPage>(text === "" ? CLIENTS_API : `${CLIENTS_API}?${text}`),
  });
}

export function clientQuery(id: string) {
  return queryOptions({
    queryKey: [...CLIENTS_KEY, "one", id] as const,
    queryFn: () => apiJson<Client>(`${CLIENTS_API}/${encodeURIComponent(id)}`),
  });
}

/**
 * The Project form's Client picker: active Clients by name matching
 * `search`, or the Clients `ids` names whatever their state.
 */
export function clientOptionsQuery(
  filter: { search?: string; ids?: readonly string[] } = {},
) {
  const query = new URLSearchParams();
  if (filter.search != null && filter.search !== "")
    query.set("search", filter.search);
  if (filter.ids != null && filter.ids.length > 0)
    query.set("ids", filter.ids.join(","));
  const text = query.toString();
  return queryOptions({
    queryKey: [...CLIENTS_KEY, "options", text] as const,
    queryFn: async () =>
      (
        await apiJson<ListConstructionMastersClientOptionsResponseModel>(
          `${CLIENTS_API}/options${text === "" ? "" : `?${text}`}`,
        )
      ).items,
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidateClients() {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: CLIENTS_KEY });
}

export function useCreateClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (input: ClientInput) => post<Client>(CLIENTS_API, input),
    onSuccess: invalidate,
  });
}

/** A renamed Client reaches its Projects' client name on their next save. */
export function useUpdateClient(id: string) {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (input: ClientInput & { expectedUpdatedAt: string }) =>
      post<Client>(`${CLIENTS_API}/${encodeURIComponent(id)}/update`, input),
    onSuccess: invalidate,
  });
}

export function useDeleteClient() {
  const invalidate = useInvalidateClients();
  return useMutation({
    mutationFn: (client: Pick<Client, "id" | "updatedAt">) =>
      post<null>(`${CLIENTS_API}/${encodeURIComponent(client.id)}/delete`, {
        expectedUpdatedAt: client.updatedAt,
      }),
    onSuccess: invalidate,
  });
}
