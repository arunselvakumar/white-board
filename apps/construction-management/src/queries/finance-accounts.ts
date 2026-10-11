import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionFinanceAccountResponseModel,
  CreateConstructionFinanceAccountRequestModel,
  GetConstructionFinanceAccountOptionsResponseModel,
  GetConstructionFinanceAccountStatementResponseModel,
  ListConstructionFinanceAccountsResponseModel,
  UpdateConstructionFinanceAccountRequestModel,
} from "@/app/api/construction/finance/accounts/account-models";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { apiJson } from "./http";

export type AccountOption =
  GetConstructionFinanceAccountOptionsResponseModel["items"][number];
export type CompanyAccount = ConstructionFinanceAccountResponseModel;
export type AccountStatement =
  GetConstructionFinanceAccountStatementResponseModel;
export type AccountStatementLine = AccountStatement["entries"][number];
export type CreateAccountInput = z.input<
  typeof CreateConstructionFinanceAccountRequestModel
>;
export type UpdateAccountInput = z.input<
  typeof UpdateConstructionFinanceAccountRequestModel
>;

export const FINANCE_ACCOUNTS_API = `${FINANCE_API}/accounts`;

/** Every account query key starts here; invalidate it after an account changes. */
export const FINANCE_ACCOUNTS_KEY = [...FINANCE_KEY, "accounts"] as const;

/** The accounts the viewer may pay from or receive into (the account picker). */
export function accountOptionsQuery() {
  return queryOptions({
    queryKey: [...FINANCE_ACCOUNTS_KEY, "options"] as const,
    queryFn: () =>
      apiJson<GetConstructionFinanceAccountOptionsResponseModel>(
        `${FINANCE_ACCOUNTS_API}/options`,
      ),
    staleTime: 30_000,
  });
}

/** Masters → Company's Bank A/C: Cash and Bank accounts with balances. */
export function companyAccountsQuery() {
  return queryOptions({
    queryKey: [...FINANCE_ACCOUNTS_KEY, "list"] as const,
    queryFn: () =>
      apiJson<ListConstructionFinanceAccountsResponseModel>(
        FINANCE_ACCOUNTS_API,
      ),
  });
}

/** An account's statement (Ledger) for `from`–`to` (this month when empty). */
export function accountStatementQuery(
  accountId: string,
  period: { from?: string; to?: string } = {},
) {
  const params = new URLSearchParams();
  if (period.from != null && period.from !== "")
    params.set("from", period.from);
  if (period.to != null && period.to !== "") params.set("to", period.to);
  const text = params.toString();
  return queryOptions({
    queryKey: [...FINANCE_ACCOUNTS_KEY, "statement", accountId, text] as const,
    queryFn: () =>
      apiJson<AccountStatement>(
        `${FINANCE_ACCOUNTS_API}/${encodeURIComponent(accountId)}/statement${text === "" ? "" : `?${text}`}`,
      ),
  });
}

export type AccountCommand =
  | { kind: "create"; input: CreateAccountInput }
  | { kind: "update"; id: string; input: UpdateAccountInput }
  | { kind: "setPrimary"; id: string }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Add, edit, Set As Primary and delete; every account query refreshes after. */
export function useAccountCommand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (command: AccountCommand): Promise<unknown> => {
      const item = (id: string, action: string) =>
        `${FINANCE_ACCOUNTS_API}/${encodeURIComponent(id)}/${action}`;
      switch (command.kind) {
        case "create":
          return postJson(FINANCE_ACCOUNTS_API, command.input);
        case "update":
          return postJson(item(command.id, "update"), command.input);
        case "setPrimary":
          return postJson(item(command.id, "set-primary"), {});
        case "delete":
          return postJson(item(command.id, "delete"), {
            expectedUpdatedAt: command.expectedUpdatedAt,
          });
      }
    },
    onSuccess: () =>
      client.invalidateQueries({ queryKey: FINANCE_ACCOUNTS_KEY }),
  });
}
