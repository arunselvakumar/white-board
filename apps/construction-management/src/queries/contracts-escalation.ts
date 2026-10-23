import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { z } from "zod";

import type {
  ConstructionContractsEscalationFormOptionsResponseModel,
  CreateConstructionContractsEscalationBillRequestModel,
  GetConstructionContractsEscalationBillResponseModel,
  PreviewConstructionContractsEscalationBillResponseModel,
  UpdateConstructionContractsEscalationBillRequestModel,
} from "@/app/api/construction/contracts/escalation-bills/escalation-bill-models";
import type {
  ConstructionContractsEscalationClauseResponseModel,
  CreateConstructionContractsEscalationClauseRequestModel,
  UpdateConstructionContractsEscalationClauseRequestModel,
} from "@/app/api/construction/contracts/escalation-clauses/escalation-clause-models";
import type {
  ConstructionContractsPriceIndexModel,
  CreateConstructionContractsPriceIndexRequestModel,
  ImportConstructionContractsPriceIndicesResponseModel,
  ListConstructionContractsPriceIndicesResponseModel,
} from "@/app/api/construction/contracts/price-indices/price-index-models";

import { CONTRACTS_API, CONTRACTS_KEY } from "./contracts-access";
import { CLIENT_BILLS_KEY } from "./contracts-client-bills";
import { CONTRACTOR_BILLS_KEY } from "./contracts-contractor-bills";
import { apiJson } from "./http";

// ---------------------------------------------------------------------------
// Price indices (CM-1109)
// ---------------------------------------------------------------------------

export type PriceIndexList = ListConstructionContractsPriceIndicesResponseModel;
export type PriceIndexSeries = PriceIndexList["series"][number];
export type PriceIndex = ConstructionContractsPriceIndexModel;
export type PriceIndexInput = CreateConstructionContractsPriceIndexRequestModel;
export type PriceIndexImportResult =
  ImportConstructionContractsPriceIndicesResponseModel;

export const PRICE_INDICES_API = `${CONTRACTS_API}/price-indices`;
export const PRICE_INDICES_KEY = [...CONTRACTS_KEY, "price-indices"] as const;
export const PRICE_INDICES_PATH = "/app/masters/price-indices";
export const PRICE_INDEX_SAMPLE_URL = `${PRICE_INDICES_API}/sample`;
export const PRICE_INDEX_EXPORT_URL = `${PRICE_INDICES_API}/export`;

export function priceIndicesQuery() {
  return queryOptions({
    queryKey: [...PRICE_INDICES_KEY, "list"] as const,
    queryFn: () => apiJson<PriceIndexList>(PRICE_INDICES_API),
  });
}

function post<T>(path: string, body: unknown): Promise<T> {
  return apiJson<T>(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function useInvalidate(key: readonly unknown[]) {
  const client = useQueryClient();
  return () => client.invalidateQueries({ queryKey: key });
}

export type PriceIndexCommand =
  | { kind: "create"; input: PriceIndexInput }
  | {
      kind: "update";
      id: string;
      value: string;
      expectedUpdatedAt: string;
    }
  | { kind: "delete"; id: string };

export function usePriceIndexCommand() {
  const invalidate = useInvalidate(PRICE_INDICES_KEY);
  return useMutation({
    mutationFn: (command: PriceIndexCommand) => {
      if (command.kind === "create")
        return post<PriceIndex | null>(PRICE_INDICES_API, command.input);
      if (command.kind === "update")
        return post<PriceIndex | null>(
          `${PRICE_INDICES_API}/${encodeURIComponent(command.id)}/update`,
          {
            value: command.value,
            expectedUpdatedAt: command.expectedUpdatedAt,
          },
        );
      return post<null>(
        `${PRICE_INDICES_API}/${encodeURIComponent(command.id)}/delete`,
        {},
      );
    },
    onSuccess: invalidate,
  });
}

/** Uploads the filled sample; every row or none. */
export function useImportPriceIndices() {
  const invalidate = useInvalidate(PRICE_INDICES_KEY);
  return useMutation({
    mutationFn: (file: File) =>
      apiJson<PriceIndexImportResult>(`${PRICE_INDICES_API}/import`, {
        method: "POST",
        headers: {
          "content-type":
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        },
        body: file,
      }),
    onSuccess: invalidate,
  });
}

// ---------------------------------------------------------------------------
// Escalation clauses
// ---------------------------------------------------------------------------

export type EscalationClauseView =
  ConstructionContractsEscalationClauseResponseModel;
export type EscalationClauseInput = z.input<
  typeof CreateConstructionContractsEscalationClauseRequestModel
>;
export type EscalationClauseUpdate = z.input<
  typeof UpdateConstructionContractsEscalationClauseRequestModel
>;
export type EscalationScope = { projectId: string; workOrderId: string | null };

export const ESCALATION_CLAUSES_KEY = [
  ...CONTRACTS_KEY,
  "escalation-clauses",
] as const;

export function escalationClauseQuery(scope: EscalationScope) {
  return queryOptions({
    queryKey: [
      ...ESCALATION_CLAUSES_KEY,
      scope.projectId,
      scope.workOrderId ?? "client",
    ] as const,
    queryFn: () =>
      apiJson<EscalationClauseView>(
        scope.workOrderId == null
          ? `${CONTRACTS_API}/client-bills/contract/escalation-clause?projectId=${encodeURIComponent(scope.projectId)}`
          : `${CONTRACTS_API}/work-orders/${encodeURIComponent(scope.workOrderId)}/escalation-clause`,
      ),
  });
}

export type EscalationClauseCommand =
  | { kind: "create"; input: EscalationClauseInput }
  | { kind: "update"; id: string; input: EscalationClauseUpdate }
  | { kind: "delete"; id: string; expectedUpdatedAt: string };

export function useEscalationClauseCommand(scope: EscalationScope) {
  const client = useQueryClient();
  const key = escalationClauseQuery(scope).queryKey;
  return useMutation({
    mutationFn: (command: EscalationClauseCommand) => {
      const base = `${CONTRACTS_API}/escalation-clauses`;
      if (command.kind === "create")
        return post<EscalationClauseView>(base, command.input);
      if (command.kind === "update")
        return post<EscalationClauseView>(
          `${base}/${encodeURIComponent(command.id)}/update`,
          command.input,
        );
      return post<EscalationClauseView>(
        `${base}/${encodeURIComponent(command.id)}/delete`,
        { expectedUpdatedAt: command.expectedUpdatedAt },
      );
    },
    onSuccess: (view) => {
      client.setQueryData(key, view);
    },
  });
}

// ---------------------------------------------------------------------------
// Escalation bills
// ---------------------------------------------------------------------------

export type EscalationBill =
  GetConstructionContractsEscalationBillResponseModel;
export type EscalationWorking = EscalationBill["working"];
export type EscalationComponentWorking =
  EscalationWorking["components"][number];
export type EscalationPreview =
  PreviewConstructionContractsEscalationBillResponseModel;
export type EscalationFormOptions =
  ConstructionContractsEscalationFormOptionsResponseModel;
export type EscalationBillInput = z.input<
  typeof CreateConstructionContractsEscalationBillRequestModel
>;
export type EscalationBillUpdate = z.input<
  typeof UpdateConstructionContractsEscalationBillRequestModel
>;
export type EscalationSide = "contractor" | "client";

export const ESCALATION_BILLS_API = `${CONTRACTS_API}/escalation-bills`;
export const ESCALATION_BILLS_KEY = [
  ...CONTRACTS_KEY,
  "escalation-bills",
] as const;

/** `/app/projects/{id}/contractor-bills/escalation/{billId}` (or client-bills). */
export function escalationBillPath(
  projectId: string,
  side: EscalationSide,
  id: string,
): string {
  return `/app/projects/${projectId}/${side === "client" ? "client-bills" : "contractor-bills"}/escalation/${id}`;
}

export const escalationBillPdfUrl = (id: string) =>
  `${ESCALATION_BILLS_API}/${encodeURIComponent(id)}/pdf`;

export function escalationBillQuery(id: string) {
  return queryOptions({
    queryKey: [...ESCALATION_BILLS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<EscalationBill>(
        `${ESCALATION_BILLS_API}/${encodeURIComponent(id)}`,
      ),
  });
}

export function escalationFormOptionsQuery(
  projectId: string,
  side: EscalationSide,
) {
  return queryOptions({
    queryKey: [
      ...ESCALATION_BILLS_KEY,
      "form-options",
      projectId,
      side,
    ] as const,
    queryFn: () =>
      apiJson<EscalationFormOptions>(
        `${ESCALATION_BILLS_API}/form-options?projectId=${encodeURIComponent(projectId)}&side=${side}`,
      ),
  });
}

/** What a draft over the period would come to, saving nothing. */
export function escalationPreviewQuery(input: {
  projectId: string;
  workOrderId: string | null;
  billDate: string;
  fromMonth: string;
  toMonth: string;
}) {
  const query = new URLSearchParams({
    projectId: input.projectId,
    billDate: input.billDate,
    fromMonth: input.fromMonth,
    toMonth: input.toMonth,
  });
  if (input.workOrderId != null) query.set("workOrderId", input.workOrderId);
  const text = query.toString();
  return queryOptions({
    queryKey: [...ESCALATION_BILLS_KEY, "preview", text] as const,
    queryFn: () =>
      apiJson<EscalationPreview>(`${ESCALATION_BILLS_API}/preview?${text}`),
    retry: false,
  });
}

/** A bill changes the side's list, and the clause's lock. */
function useInvalidateEscalation() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ESCALATION_BILLS_KEY }),
      client.invalidateQueries({ queryKey: ESCALATION_CLAUSES_KEY }),
      client.invalidateQueries({ queryKey: CONTRACTOR_BILLS_KEY }),
      client.invalidateQueries({ queryKey: CLIENT_BILLS_KEY }),
    ]);
}

export function useCreateEscalationBill() {
  const invalidate = useInvalidateEscalation();
  return useMutation({
    mutationFn: (input: EscalationBillInput) =>
      post<EscalationBill>(ESCALATION_BILLS_API, input),
    onSuccess: invalidate,
  });
}

export type EscalationBillCommand =
  | { kind: "update"; input: EscalationBillUpdate }
  | {
      kind: "refresh" | "submit" | "approve" | "delete";
      expectedUpdatedAt: string;
    }
  | { kind: "reject" | "reverse"; reason: string; expectedUpdatedAt: string };

export function useEscalationBillCommand(id: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateEscalation();
  const detail = escalationBillQuery(id).queryKey;
  return useMutation({
    mutationFn: (command: EscalationBillCommand) => {
      const { kind, ...rest } = command;
      return post<EscalationBill | null>(
        `${ESCALATION_BILLS_API}/${encodeURIComponent(id)}/${kind}`,
        command.kind === "update" ? command.input : rest,
      );
    },
    onSuccess: (saved, command) => {
      if (command.kind !== "delete") {
        if (saved != null) client.setQueryData(detail, saved);
        return invalidate();
      }
      return client.invalidateQueries({
        queryKey: ESCALATION_BILLS_KEY,
        predicate: (query) =>
          JSON.stringify(query.queryKey) !== JSON.stringify(detail),
      });
    },
  });
}
