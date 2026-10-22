import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  ConstructionContractsContractorBillFormOptionsResponseModel,
  ConstructionContractsContractorBillSummaryModel,
  CreateConstructionContractsContractorBillRequestModel,
  GetConstructionContractsContractorBillResponseModel,
  ListConstructionContractsContractorBillsResponseModel,
  UpdateConstructionContractsContractorBillRequestModel,
} from "@/app/api/construction/contracts/contractor-bills/contractor-bill-models";
import type { BillStatus } from "@/src/contracts/domain/contract-terms";

import { CONTRACTS_API, CONTRACTS_KEY } from "./contracts-access";
import { MEASUREMENTS_KEY } from "./contracts-measurements";
import { WORK_ORDERS_KEY } from "./contracts-work-orders";
import { apiJson } from "./http";

export type ContractorBill =
  GetConstructionContractsContractorBillResponseModel;
export type ContractorBillSummary =
  ConstructionContractsContractorBillSummaryModel;
export type ContractorBillPage =
  ListConstructionContractsContractorBillsResponseModel;
export type ContractorBillLine = ContractorBill["lines"][number];
export type ContractorBillRow = ContractorBillLine["rows"][number];
export type ContractorBillDeduction = ContractorBill["deductionLines"][number];
export type ContractorBillFormOptions =
  ConstructionContractsContractorBillFormOptionsResponseModel;
export type ContractorBillInput =
  CreateConstructionContractsContractorBillRequestModel;
export type ContractorBillUpdate =
  UpdateConstructionContractsContractorBillRequestModel;

export const CONTRACTOR_BILLS_API = `${CONTRACTS_API}/contractor-bills`;

/** Every Contractor Bill query key starts here (CM-1106). */
export const CONTRACTOR_BILLS_KEY = [
  ...CONTRACTS_KEY,
  "contractor-bills",
] as const;

/** `/app/projects/{id}/contractor-bills`, `…/new` or a bill. */
export function contractorBillsPath(projectId: string, id?: string): string {
  const base = `/app/projects/${projectId}/contractor-bills`;
  return id == null ? base : `${base}/${id}`;
}

export const contractorBillPdfUrl = (id: string) =>
  `${CONTRACTOR_BILLS_API}/${encodeURIComponent(id)}/pdf`;

export type ContractorBillFilters = {
  status: BillStatus | "";
  workOrderId: string;
  contractorId: string;
  from: string;
  to: string;
  cursor: { after: string } | { before: string } | null;
};

export function contractorBillsQuery(
  projectId: string,
  filters: ContractorBillFilters,
  limit?: number,
) {
  const query = new URLSearchParams({ projectId });
  if (filters.status !== "") query.set("status", filters.status);
  if (filters.workOrderId !== "") query.set("workOrderId", filters.workOrderId);
  if (filters.contractorId !== "")
    query.set("contractorId", filters.contractorId);
  if (filters.from !== "") query.set("from", filters.from);
  if (filters.to !== "") query.set("to", filters.to);
  if (limit != null) query.set("limit", String(limit));
  if (filters.cursor != null) {
    if ("after" in filters.cursor) query.set("after", filters.cursor.after);
    else query.set("before", filters.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...CONTRACTOR_BILLS_KEY, "list", text] as const,
    queryFn: () =>
      apiJson<ContractorBillPage>(`${CONTRACTOR_BILLS_API}?${text}`),
  });
}

export function contractorBillQuery(id: string) {
  return queryOptions({
    queryKey: [...CONTRACTOR_BILLS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<ContractorBill>(
        `${CONTRACTOR_BILLS_API}/${encodeURIComponent(id)}`,
      ),
  });
}

/** Issued Work Orders with their checked rows waiting to be billed. */
export function contractorBillFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...CONTRACTOR_BILLS_KEY, "form-options", projectId] as const,
    queryFn: () =>
      apiJson<ContractorBillFormOptions>(
        `${CONTRACTOR_BILLS_API}/form-options?projectId=${encodeURIComponent(projectId)}`,
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

/** A bill takes and frees measurement rows and bills Work Order lines. */
function useInvalidateBills() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: CONTRACTOR_BILLS_KEY }),
      client.invalidateQueries({ queryKey: WORK_ORDERS_KEY }),
      client.invalidateQueries({ queryKey: MEASUREMENTS_KEY }),
    ]);
}

export function useCreateContractorBill() {
  const invalidate = useInvalidateBills();
  return useMutation({
    mutationFn: (input: ContractorBillInput) =>
      post<ContractorBill>(CONTRACTOR_BILLS_API, input),
    onSuccess: invalidate,
  });
}

export type ContractorBillCommand =
  | { kind: "update"; input: ContractorBillUpdate }
  | { kind: "refresh"; measuredUpTo?: string; expectedUpdatedAt: string }
  | { kind: "submit"; expectedUpdatedAt: string }
  | {
      kind: "approve";
      confirmUnbilled?: boolean;
      expectedUpdatedAt: string;
    }
  | {
      kind: "reject" | "reverse";
      reason: string;
      expectedUpdatedAt: string;
    }
  | { kind: "delete"; expectedUpdatedAt: string };

function bodyOf(command: ContractorBillCommand): unknown {
  if (command.kind === "update") return command.input;
  const { kind: _kind, ...body } = command;
  return body;
}

export function useContractorBillCommand(id: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateBills();
  const detail = contractorBillQuery(id).queryKey;
  return useMutation({
    mutationFn: (command: ContractorBillCommand) =>
      post<ContractorBill | null>(
        `${CONTRACTOR_BILLS_API}/${encodeURIComponent(id)}/${command.kind}`,
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
          queryKey: CONTRACTOR_BILLS_KEY,
          predicate: (query) =>
            JSON.stringify(query.queryKey) !== JSON.stringify(detail),
        }),
        client.invalidateQueries({ queryKey: WORK_ORDERS_KEY }),
        client.invalidateQueries({ queryKey: MEASUREMENTS_KEY }),
      ]);
    },
  });
}
