import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  BulkDecideConstructionFinanceOtherExpensesResponseModel,
  ConstructionFinanceOtherExpenseResponseModel,
  CreateConstructionFinanceOtherExpenseRequestModel,
  ListConstructionFinanceOtherExpensesResponseModel,
} from "@/app/api/construction/finance/other-expenses/other-expense-models";

import { FINANCE_API, FINANCE_KEY } from "./finance-access";
import { apiJson } from "./http";

export type OtherExpense = ConstructionFinanceOtherExpenseResponseModel;
export type OtherExpensePage =
  ListConstructionFinanceOtherExpensesResponseModel;
export type OtherExpenseInput =
  CreateConstructionFinanceOtherExpenseRequestModel;
export type OtherExpenseStatus = OtherExpense["status"];

export const OTHER_EXPENSES_API = `${FINANCE_API}/other-expenses`;

/** Every Other Expense query key starts here (CM-704). */
export const OTHER_EXPENSES_KEY = [...FINANCE_KEY, "other-expenses"] as const;

/** The screens' paths under the Project's Payments module. */
export function otherExpensesPath(projectId: string, rest = ""): string {
  return `/app/projects/${encodeURIComponent(projectId)}/payments/other-expenses${rest}`;
}

export type OtherExpenseFilters = {
  from: string;
  to: string;
  paymentCategoryId: string;
  accountId: string;
  status: OtherExpenseStatus | "";
};

export const NO_EXPENSE_FILTERS: OtherExpenseFilters = {
  from: "",
  to: "",
  paymentCategoryId: "",
  accountId: "",
  status: "",
};

export type OtherExpenseCursor = { after: string } | { before: string } | null;

export function otherExpensesQuery(
  projectId: string,
  filters: OtherExpenseFilters,
  cursor: OtherExpenseCursor,
) {
  const query = new URLSearchParams({ projectId });
  for (const key of [
    "from",
    "to",
    "paymentCategoryId",
    "accountId",
    "status",
  ] as const)
    if (filters[key] !== "") query.set(key, filters[key]);
  if (cursor != null) {
    if ("after" in cursor) query.set("after", cursor.after);
    else query.set("before", cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...OTHER_EXPENSES_KEY, "list", text] as const,
    queryFn: () => apiJson<OtherExpensePage>(`${OTHER_EXPENSES_API}?${text}`),
  });
}

export function otherExpenseQuery(id: string) {
  return queryOptions({
    queryKey: [...OTHER_EXPENSES_KEY, "one", id] as const,
    queryFn: () =>
      apiJson<OtherExpense>(`${OTHER_EXPENSES_API}/${encodeURIComponent(id)}`),
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

export type OtherExpenseCommand =
  | { kind: "create"; input: OtherExpenseInput }
  | {
      kind: "update";
      id: string;
      input: Omit<OtherExpenseInput, "projectId">;
      expectedUpdatedAt: string;
    }
  | { kind: "approve"; id: string; expectedUpdatedAt: string }
  | { kind: "reject"; id: string; reason: string; expectedUpdatedAt: string }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

export function runOtherExpenseCommand(
  command: OtherExpenseCommand,
): Promise<OtherExpense | null> {
  const item = (id: string, verb: string) =>
    `${OTHER_EXPENSES_API}/${encodeURIComponent(id)}/${verb}`;
  switch (command.kind) {
    case "create":
      return post(OTHER_EXPENSES_API, command.input);
    case "update":
      return post(item(command.id, "update"), {
        ...command.input,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "approve":
      return post(item(command.id, "approve"), {
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "reject":
      return post(item(command.id, "reject"), {
        reason: command.reason,
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
    case "delete":
      return post<null>(item(command.id, "delete"), {
        expectedUpdatedAt: command.expectedUpdatedAt,
      });
  }
}

/**
 * Every expense write; approving, editing and deleting move account
 * balances, so the account reads refresh too.
 */
export function useOtherExpenseCommand() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: runOtherExpenseCommand,
    onSettled: () => client.invalidateQueries({ queryKey: FINANCE_KEY }),
  });
}

export function useBulkDecideOtherExpenses() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      projectId: string;
      ids: string[];
      approve: boolean;
      reason?: string;
    }) =>
      post<BulkDecideConstructionFinanceOtherExpensesResponseModel>(
        `${OTHER_EXPENSES_API}/${input.approve ? "bulk-approve" : "bulk-reject"}`,
        input.approve
          ? { projectId: input.projectId, ids: input.ids }
          : {
              projectId: input.projectId,
              ids: input.ids,
              reason: input.reason ?? "",
            },
      ),
    onSettled: () => client.invalidateQueries({ queryKey: FINANCE_KEY }),
  });
}
