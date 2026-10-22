import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionContractsClientBillFormOptionsResponseModel,
  ConstructionContractsClientBillSummaryModel,
  CreateConstructionContractsClientBillRequestModel,
  GetConstructionContractsClientBillResponseModel,
  GetConstructionContractsClientContractResponseModel,
  ListConstructionContractsClientBillsResponseModel,
  UpdateConstructionContractsClientBillRequestModel,
  UpdateConstructionContractsClientContractRequestModel,
} from "@/app/api/construction/contracts/client-bills/client-bill-models";
import type { BillStatus } from "@/src/contracts/domain/contract-terms";

import { CONTRACTS_API, CONTRACTS_KEY } from "./contracts-access";
import { MEASUREMENTS_KEY } from "./contracts-measurements";
import { FINANCE_KEY } from "./finance-access";
import { apiJson } from "./http";

export type ClientBill = GetConstructionContractsClientBillResponseModel;
export type ClientBillSummary = ConstructionContractsClientBillSummaryModel;
export type ClientBillPage = ListConstructionContractsClientBillsResponseModel;
export type ClientBillLine = ClientBill["lines"][number];
export type ClientBillRow = ClientBillLine["rows"][number];
export type ClientBillSetup = ClientBillPage["setup"];
export type ClientBillFormOptions =
  ConstructionContractsClientBillFormOptionsResponseModel;
export type ClientBillInput = CreateConstructionContractsClientBillRequestModel;
export type ClientBillUpdate =
  UpdateConstructionContractsClientBillRequestModel;
export type ClientContract =
  GetConstructionContractsClientContractResponseModel;
export type ClientContractInput =
  UpdateConstructionContractsClientContractRequestModel;

export const CLIENT_BILLS_API = `${CONTRACTS_API}/client-bills`;

/** Every Client Bill query key starts here (CM-1107). */
export const CLIENT_BILLS_KEY = [...CONTRACTS_KEY, "client-bills"] as const;

/** `/app/projects/{id}/client-bills` or a bill. */
export function clientBillsPath(projectId: string, id?: string): string {
  const base = `/app/projects/${projectId}/client-bills`;
  return id == null ? base : `${base}/${id}`;
}

export const clientBillPdfUrl = (id: string) =>
  `${CLIENT_BILLS_API}/${encodeURIComponent(id)}/pdf`;

export type ClientBillFilters = {
  status: BillStatus | "";
  from: string;
  to: string;
  cursor: { after: string } | { before: string } | null;
};

export function clientBillsQuery(
  projectId: string,
  filters: ClientBillFilters,
  limit?: number,
) {
  const query = new URLSearchParams({ projectId });
  if (filters.status !== "") query.set("status", filters.status);
  if (filters.from !== "") query.set("from", filters.from);
  if (filters.to !== "") query.set("to", filters.to);
  if (limit != null) query.set("limit", String(limit));
  if (filters.cursor != null) {
    if ("after" in filters.cursor) query.set("after", filters.cursor.after);
    else query.set("before", filters.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...CLIENT_BILLS_KEY, "list", text] as const,
    queryFn: () => apiJson<ClientBillPage>(`${CLIENT_BILLS_API}?${text}`),
  });
}

export function clientBillQuery(id: string) {
  return queryOptions({
    queryKey: [...CLIENT_BILLS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<ClientBill>(`${CLIENT_BILLS_API}/${encodeURIComponent(id)}`),
  });
}

/** Whether the Project can be billed, and the checked rows waiting per date. */
export function clientBillFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...CLIENT_BILLS_KEY, "form-options", projectId] as const,
    queryFn: () =>
      apiJson<ClientBillFormOptions>(
        `${CLIENT_BILLS_API}/form-options?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

/** The Project's client contract terms. */
export function clientContractQuery(projectId: string) {
  return queryOptions({
    queryKey: [...CLIENT_BILLS_KEY, "contract", projectId] as const,
    queryFn: () =>
      apiJson<ClientContract>(
        `${CLIENT_BILLS_API}/contract?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A bill takes and frees measurement rows and makes finance invoices. */
function useInvalidateBills() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: CLIENT_BILLS_KEY }),
      client.invalidateQueries({ queryKey: MEASUREMENTS_KEY }),
      client.invalidateQueries({ queryKey: FINANCE_KEY }),
    ]);
}

export function useCreateClientBill() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: (input: ClientBillInput) =>
      post<ClientBill>(CLIENT_BILLS_API, input),
    onSuccess: invalidate,
  });
}

export function useSaveClientContract(projectId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: Omit<ClientContractInput, "projectId">) =>
      post<ClientContract>(`${CLIENT_BILLS_API}/contract/update`, {
        projectId,
        ...input,
      }),
    onSuccess: (saved) => {
      client.setQueryData(clientContractQuery(projectId).queryKey, saved);
      return client.invalidateQueries({ queryKey: CLIENT_BILLS_KEY });
    },
  });
}

export type ClientBillCommand =
  | { kind: "update"; input: ClientBillUpdate }
  | { kind: "refresh"; measuredUpTo?: string; expectedUpdatedAt: string }
  | { kind: "submit" | "approve"; expectedUpdatedAt: string }
  | {
      kind: "reject" | "reverse";
      reason: string;
      expectedUpdatedAt: string;
    }
  | { kind: "delete"; expectedUpdatedAt: string };

function bodyOf(command: ClientBillCommand): unknown {
  if (command.kind === "update") return command.input;
  const { kind: _kind, ...body } = command;
  return body;
}

export function useClientBillCommand(id: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateBills();
  const detail = clientBillQuery(id).queryKey;
  return useMutation({
    mutationFn: (command: ClientBillCommand) =>
      post<ClientBill | null>(
        `${CLIENT_BILLS_API}/${encodeURIComponent(id)}/${command.kind}`,
        bodyOf(command),
      ),
    onSuccess: (saved, command) => {
      if (command.kind !== "delete") {
        if (saved != null) client.setQueryData(detail, saved);
        return invalidate();
      }
      // The deleted bill's own page is left; refetching it would 404.
      return Promise.all([
        client.invalidateQueries({
          queryKey: CLIENT_BILLS_KEY,
          predicate: (query) =>
            JSON.stringify(query.queryKey) !== JSON.stringify(detail),
        }),
        client.invalidateQueries({ queryKey: MEASUREMENTS_KEY }),
      ]);
    },
  });
}
