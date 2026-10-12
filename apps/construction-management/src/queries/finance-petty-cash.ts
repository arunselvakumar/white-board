import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionFinancePettyCashAccountResponseModel,
  ConstructionFinancePettyCashVoucherResponseModel,
  CreateConstructionFinancePettyCashVoucherRequestModel,
  ListConstructionFinancePettyCashAccountsResponseModel,
  ListConstructionFinancePettyCashVouchersResponseModel,
  OpenConstructionFinancePettyCashAccountRequestModel,
  UpdateConstructionFinancePettyCashVoucherRequestModel,
} from "@/app/api/construction/finance/petty-cash/petty-cash-models";
import type { ApprovalStatus } from "@/src/shared-kernel/approval";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { FINANCE_ACCOUNTS_KEY } from "./finance-accounts";
import { apiJson } from "./http";

export type PettyCashAccount = ConstructionFinancePettyCashAccountResponseModel;
export type PettyCashAccounts =
  ListConstructionFinancePettyCashAccountsResponseModel;
export type PettyCashVoucher = ConstructionFinancePettyCashVoucherResponseModel;
export type PettyCashVoucherPage =
  ListConstructionFinancePettyCashVouchersResponseModel;
export type VoucherType = PettyCashVoucher["voucherType"];
/** Request bodies as the browser sends them: defaults may be left out. */
export type NewVoucher = z.input<
  typeof CreateConstructionFinancePettyCashVoucherRequestModel
>;
export type VoucherChange = z.input<
  typeof UpdateConstructionFinancePettyCashVoucherRequestModel
>;
export type OpenPettyCashAccount = z.input<
  typeof OpenConstructionFinancePettyCashAccountRequestModel
>;

export const PETTY_CASH_API = `${FINANCE_API}/petty-cash`;

/** Every Petty Cash key starts here; one invalidation refreshes the tab. */
export const PETTY_CASH_KEY = [...FINANCE_KEY, "petty-cash"] as const;

export function pettyCashAccountsQuery() {
  return queryOptions({
    queryKey: [...PETTY_CASH_KEY, "accounts"] as const,
    queryFn: () => apiJson<PettyCashAccounts>(`${PETTY_CASH_API}/accounts`),
  });
}

export type VoucherFilters = {
  accountId?: string | null;
  projectId?: string | null;
  from?: string;
  to?: string;
  type?: VoucherType | "";
  status?: ApprovalStatus | "";
  paymentCategoryId?: string;
  cursor?: { after: string } | { before: string } | null;
};

export function voucherListParams(filters: VoucherFilters): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string | null | undefined) => {
    if (value != null && value !== "") params.set(key, value);
  };
  set("accountId", filters.accountId);
  set("projectId", filters.projectId);
  set("from", filters.from);
  set("to", filters.to);
  set("type", filters.type);
  set("status", filters.status);
  set("paymentCategoryId", filters.paymentCategoryId);
  if (filters.cursor != null) {
    if ("after" in filters.cursor) set("after", filters.cursor.after);
    else set("before", filters.cursor.before);
  }
  return params;
}

export function pettyCashVouchersQuery(filters: VoucherFilters) {
  const params = voucherListParams(filters);
  return queryOptions({
    queryKey: [...PETTY_CASH_KEY, "vouchers", params.toString()] as const,
    queryFn: () =>
      apiJson<PettyCashVoucherPage>(
        `${PETTY_CASH_API}/vouchers${params.size === 0 ? "" : `?${params.toString()}`}`,
      ),
  });
}

export function pettyCashVoucherQuery(id: string) {
  return queryOptions({
    queryKey: [...PETTY_CASH_KEY, "voucher", id] as const,
    queryFn: () =>
      apiJson<PettyCashVoucher>(
        `${PETTY_CASH_API}/vouchers/${encodeURIComponent(id)}`,
      ),
  });
}

/** Export Receipts: a link the browser downloads (a ZIP). */
export function receiptsZipUrl(
  accountId: string,
  from: string,
  to: string,
): string {
  const params = new URLSearchParams({ from, to });
  return `${PETTY_CASH_API}/accounts/${encodeURIComponent(accountId)}/receipts.zip?${params.toString()}`;
}

/**
 * An account's statement for a period (the accounts' generic endpoint,
 * `GET /api/construction/finance/accounts/{id}/statement`): the opening
 * balance, each entry with its running balance, the totals and the
 * closing balance. Paise throughout.
 */
export type AccountStatement = {
  account: { id: string; name: string; kind: "cash" | "bank" | "petty_cash" };
  from: string;
  to: string;
  opening: number;
  entries: {
    id: string;
    entryDate: string;
    kind: "opening" | "receipt" | "payment" | "transfer_in" | "transfer_out";
    amount: number;
    balance: number;
    sourceType: string;
    sourceId: string;
    documentNumber: string | null;
    counterpartyName: string | null;
    mode: string | null;
    reference: string | null;
    paymentCategoryName: string | null;
    projectName: string | null;
    narration: string | null;
    isReversal: boolean;
  }[];
  totalIn: number;
  totalOut: number;
  closing: number;
};

export function accountStatementQuery(
  accountId: string,
  from: string,
  to: string,
) {
  const params = new URLSearchParams({ from, to });
  return queryOptions({
    queryKey: [
      ...FINANCE_ACCOUNTS_KEY,
      "statement",
      accountId,
      from,
      to,
    ] as const,
    queryFn: () =>
      apiJson<AccountStatement>(
        `${FINANCE_API}/accounts/${encodeURIComponent(accountId)}/statement?${params.toString()}`,
      ),
  });
}

function postJson<T>(url: string, body: unknown = {}): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Refreshes Petty Cash and every account balance (the pickers, statements). */
function useRefresh() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: PETTY_CASH_KEY }),
      queryClient.invalidateQueries({ queryKey: FINANCE_ACCOUNTS_KEY }),
    ]);
}

export function useOpenPettyCashAccount() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: OpenPettyCashAccount) =>
      postJson<PettyCashAccount>(`${PETTY_CASH_API}/accounts`, input),
    onSuccess: refresh,
  });
}

export function useClosePettyCashAccount() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      postJson<undefined>(
        `${PETTY_CASH_API}/accounts/${encodeURIComponent(id)}/delete`,
      ),
    onSuccess: refresh,
  });
}

export function useCreateVoucher() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: NewVoucher) =>
      postJson<PettyCashVoucher>(`${PETTY_CASH_API}/vouchers`, input),
    onSuccess: refresh,
  });
}

export function useUpdateVoucher(id: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: VoucherChange) =>
      postJson<PettyCashVoucher>(
        `${PETTY_CASH_API}/vouchers/${encodeURIComponent(id)}/update`,
        input,
      ),
    onSuccess: refresh,
  });
}

export type VoucherDecision =
  | { id: string; approve: true }
  | { id: string; approve: false; reason: string };

/** Approve or reject one voucher. */
export function useDecideVoucher() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (decision: VoucherDecision) =>
      postJson<PettyCashVoucher>(
        `${PETTY_CASH_API}/vouchers/${encodeURIComponent(decision.id)}/${decision.approve ? "approve" : "reject"}`,
        decision.approve ? {} : { reason: decision.reason },
      ),
    onSettled: refresh,
  });
}

/** Approve or reject several vouchers, all or none. */
export function useBulkDecideVouchers() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: { ids: string[]; approve: boolean; reason?: string }) =>
      postJson<{ decided: number }>(
        `${PETTY_CASH_API}/vouchers/${input.approve ? "bulk-approve" : "bulk-reject"}`,
        input.approve
          ? { ids: input.ids }
          : { ids: input.ids, reason: input.reason ?? "" },
      ),
    onSettled: refresh,
  });
}

export function useDeleteVoucher() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) =>
      postJson<undefined>(
        `${PETTY_CASH_API}/vouchers/${encodeURIComponent(id)}/delete`,
      ),
    onSuccess: refresh,
  });
}
