import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionFinanceOtherPartyResponseModel,
  CreateConstructionFinanceOtherPartyRequestModel,
  ListConstructionFinanceOtherPartiesResponseModel,
} from "@/app/api/construction/finance/other-parties/other-party-models";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { apiJson } from "./http";

export type OtherParty = ConstructionFinanceOtherPartyResponseModel;
export type OtherPartyPage = ListConstructionFinanceOtherPartiesResponseModel;
export type OtherPartyInput = CreateConstructionFinanceOtherPartyRequestModel;

export const OTHER_PARTIES_API = `${FINANCE_API}/other-parties`;

/** Every Other Party query key starts here (CM-704). */
export const OTHER_PARTIES_KEY = [...FINANCE_KEY, "other-parties"] as const;

export type OtherPartyListFilter = {
  search: string;
  cursor: { after: string } | { before: string } | null;
};

export function otherPartiesQuery(filter: OtherPartyListFilter) {
  const query = new URLSearchParams();
  const search = filter.search.trim();
  if (search !== "") query.set("q", search);
  if (filter.cursor != null) {
    if ("after" in filter.cursor) query.set("after", filter.cursor.after);
    else query.set("before", filter.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...OTHER_PARTIES_KEY, "list", text] as const,
    queryFn: () =>
      apiJson<OtherPartyPage>(
        text === "" ? OTHER_PARTIES_API : `${OTHER_PARTIES_API}?${text}`,
      ),
  });
}

export function otherPartyQuery(id: string) {
  return queryOptions({
    queryKey: [...OTHER_PARTIES_KEY, "one", id] as const,
    queryFn: () =>
      apiJson<OtherParty>(`${OTHER_PARTIES_API}/${encodeURIComponent(id)}`),
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Saving an Other Party also changes the Paid To / Received From options. */
function useInvalidateOtherParties() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: OTHER_PARTIES_KEY }),
      client.invalidateQueries({
        queryKey: [...FINANCE_KEY, "counterparties"],
      }),
    ]);
}

export function useCreateOtherParty() {
  const invalidate = useInvalidateOtherParties();
  return useMutation({
    mutationFn: (input: OtherPartyInput) =>
      post<OtherParty>(OTHER_PARTIES_API, input),
    onSuccess: invalidate,
  });
}

export function useUpdateOtherParty(id: string) {
  const invalidate = useInvalidateOtherParties();
  return useMutation({
    mutationFn: (input: OtherPartyInput & { expectedUpdatedAt: string }) =>
      post<OtherParty>(
        `${OTHER_PARTIES_API}/${encodeURIComponent(id)}/update`,
        input,
      ),
    onSuccess: invalidate,
  });
}

export function useDeleteOtherParty() {
  const invalidate = useInvalidateOtherParties();
  return useMutation({
    mutationFn: (party: Pick<OtherParty, "id" | "updatedAt">) =>
      post<null>(
        `${OTHER_PARTIES_API}/${encodeURIComponent(party.id)}/delete`,
        {
          expectedUpdatedAt: party.updatedAt,
        },
      ),
    onSuccess: invalidate,
  });
}
