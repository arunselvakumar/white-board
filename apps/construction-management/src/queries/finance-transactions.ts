import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionFinanceRegisterItemModel,
  ConstructionFinanceTransactionResponseModel,
  ConstructionFinanceTransferResponseModel,
  CreateConstructionFinanceTransactionRequestModel,
  CreateConstructionFinanceTransferRequestModel,
  ListConstructionFinanceTransactionsResponseModel,
  UpdateConstructionFinanceTransactionRequestModel,
  UpdateConstructionFinanceTransferRequestModel,
} from "@/app/api/construction/finance/transactions/transaction-models";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { FINANCE_ACCOUNTS_KEY } from "./finance-accounts";
import { apiJson } from "./http";

export type Transaction = ConstructionFinanceTransactionResponseModel;
export type Transfer = ConstructionFinanceTransferResponseModel;
export type RegisterItem = ConstructionFinanceRegisterItemModel;
export type TransactionPage = ListConstructionFinanceTransactionsResponseModel;
export type CreateTransactionInput = z.input<
  typeof CreateConstructionFinanceTransactionRequestModel
>;
export type UpdateTransactionInput = z.input<
  typeof UpdateConstructionFinanceTransactionRequestModel
>;
export type CreateTransferInput = z.input<
  typeof CreateConstructionFinanceTransferRequestModel
>;
export type UpdateTransferInput = z.input<
  typeof UpdateConstructionFinanceTransferRequestModel
>;
export type ImportRowError = { row: number; field: string; message: string };

export const TRANSACTIONS_API = `${FINANCE_API}/transactions`;
export const TRANSFERS_API = `${FINANCE_API}/transfers`;

/** Every Transactions key starts here (CM-702). */
export const FINANCE_TRANSACTIONS_KEY = [
  ...FINANCE_KEY,
  "transactions",
] as const;

export type TransactionFilter = {
  projectId: string;
  from?: string;
  to?: string;
  type?: "in" | "out" | "transfer" | "";
  accountId?: string;
  paymentCategoryId?: string;
  mode?: string;
  counterpartyKind?: string;
  approvalStatus?: string;
  cursor?: { after: string } | { before: string } | null;
};

export function transactionsQuery(filter: TransactionFilter) {
  const query = new URLSearchParams({ projectId: filter.projectId });
  for (const key of [
    "from",
    "to",
    "type",
    "accountId",
    "paymentCategoryId",
    "mode",
    "counterpartyKind",
    "approvalStatus",
  ] as const) {
    const value = filter[key];
    if (value != null && value !== "") query.set(key, value);
  }
  if (filter.cursor != null) {
    if ("after" in filter.cursor) query.set("after", filter.cursor.after);
    else query.set("before", filter.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...FINANCE_TRANSACTIONS_KEY, "list", text] as const,
    queryFn: () => apiJson<TransactionPage>(`${TRANSACTIONS_API}?${text}`),
  });
}

export function transactionQuery(id: string) {
  return queryOptions({
    queryKey: [...FINANCE_TRANSACTIONS_KEY, "transaction", id] as const,
    queryFn: () =>
      apiJson<Transaction>(`${TRANSACTIONS_API}/${encodeURIComponent(id)}`),
  });
}

export function transferQuery(id: string) {
  return queryOptions({
    queryKey: [...FINANCE_TRANSACTIONS_KEY, "transfer", id] as const,
    queryFn: () =>
      apiJson<Transfer>(`${TRANSFERS_API}/${encodeURIComponent(id)}`),
  });
}

export function transactionSampleUrl(projectId: string): string {
  return `${TRANSACTIONS_API}/import-sample?projectId=${encodeURIComponent(projectId)}`;
}

function postJson<T>(url: string, body: unknown): Promise<T> {
  return apiJson<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Money moved: the register and every account balance refresh. */
function useInvalidate() {
  const client = useQueryClient();
  return async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: FINANCE_TRANSACTIONS_KEY }),
      client.invalidateQueries({ queryKey: FINANCE_ACCOUNTS_KEY }),
    ]);
  };
}

export type DocumentKind = "transaction" | "transfer";

export type TransactionCommand =
  | { kind: "createTransaction"; input: CreateTransactionInput }
  | { kind: "updateTransaction"; id: string; input: UpdateTransactionInput }
  | { kind: "createTransfer"; input: CreateTransferInput }
  | { kind: "updateTransfer"; id: string; input: UpdateTransferInput }
  | {
      kind: "approve";
      document: DocumentKind;
      id: string;
      expectedUpdatedAt?: string;
    }
  | {
      kind: "reject";
      document: DocumentKind;
      id: string;
      reason: string;
      expectedUpdatedAt?: string;
    }
  | {
      kind: "delete";
      document: DocumentKind;
      id: string;
      expectedUpdatedAt: string;
    };

function itemUrl(document: DocumentKind, id: string, action: string): string {
  const base = document === "transaction" ? TRANSACTIONS_API : TRANSFERS_API;
  return `${base}/${encodeURIComponent(id)}/${action}`;
}

/** Every write on a Transaction or transfer. */
export function useTransactionCommand() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (command: TransactionCommand): Promise<unknown> => {
      switch (command.kind) {
        case "createTransaction":
          return postJson<Transaction>(TRANSACTIONS_API, command.input);
        case "updateTransaction":
          return postJson<Transaction>(
            itemUrl("transaction", command.id, "update"),
            command.input,
          );
        case "createTransfer":
          return postJson<Transfer>(TRANSFERS_API, command.input);
        case "updateTransfer":
          return postJson<Transfer>(
            itemUrl("transfer", command.id, "update"),
            command.input,
          );
        case "approve":
          return postJson(itemUrl(command.document, command.id, "approve"), {
            expectedUpdatedAt: command.expectedUpdatedAt,
          });
        case "reject":
          return postJson(itemUrl(command.document, command.id, "reject"), {
            reason: command.reason,
            expectedUpdatedAt: command.expectedUpdatedAt,
          });
        case "delete":
          return postJson(itemUrl(command.document, command.id, "delete"), {
            expectedUpdatedAt: command.expectedUpdatedAt,
          });
      }
    },
    onSuccess: invalidate,
  });
}

/** Bulk approve / reject, all or none. */
export function useBulkDecideTransactions() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: {
      items: { type: DocumentKind; id: string }[];
      approve: boolean;
      reason?: string;
    }) => postJson<{ decided: number }>(`${TRANSACTIONS_API}/bulk`, input),
    onSuccess: invalidate,
  });
}

/** Import the filled sample: every row pending, or none. */
export function useImportTransactions(projectId: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (file: File) =>
      apiJson<{ imported: number; importBatchId: string }>(
        `${TRANSACTIONS_API}/import?projectId=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          headers: {
            "content-type":
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          },
          body: file,
        },
      ),
    onSuccess: invalidate,
  });
}
