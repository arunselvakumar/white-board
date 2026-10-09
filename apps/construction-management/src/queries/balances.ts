import { queryOptions } from "@tanstack/react-query";

import type {
  GetConstructionLabourBalancesResponseModel,
  GetConstructionLabourStatementResponseModel,
} from "@/app/api/construction/labour/balances/balance-models";

import { apiJson } from "./http";

export type PartyBalances = GetConstructionLabourBalancesResponseModel;
export type PartyBalanceRow = PartyBalances["items"][number];
export type PartyStatement = GetConstructionLabourStatementResponseModel;
export type StatementLine = PartyStatement["lines"][number];
export type PaymentPartyType = PartyBalances["partyType"];
export type BalancePeriodKind = PartyBalances["kind"];

export const BALANCES_API = "/api/construction/labour/balances";

/** Every balance query key starts here; payments invalidate it. */
export const BALANCES_KEY = ["labour", "balances"] as const;

export type BalancePeriod = {
  kind: BalancePeriodKind;
  /** A day in the period (monthly, weekly) or its first day (custom). */
  anchor: string;
  /** Custom only. */
  to?: string;
};

function search(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params))
    if (value != null && value.length > 0) query.set(key, value);
  return query.toString();
}

/** Previous / To Pay / Advance / Paid / Final per party of a Project. */
export function partyBalancesQuery(
  projectId: string,
  partyType: PaymentPartyType,
  period: BalancePeriod,
) {
  const query = search({
    projectId,
    partyType,
    kind: period.kind,
    anchor: period.anchor,
    to: period.kind === "custom" ? period.to : undefined,
  });
  return queryOptions({
    queryKey: [...BALANCES_KEY, "period", query],
    queryFn: () => apiJson<PartyBalances>(`${BALANCES_API}?${query}`),
  });
}

/** One party's entries with the running balance. */
export function partyStatementQuery(input: {
  projectId: string;
  partyType: PaymentPartyType;
  partyId: string;
  from: string;
  to: string;
}) {
  const query = search(input);
  return queryOptions({
    queryKey: [...BALANCES_KEY, "statement", query],
    queryFn: () =>
      apiJson<PartyStatement>(`${BALANCES_API}/statement?${query}`),
  });
}
