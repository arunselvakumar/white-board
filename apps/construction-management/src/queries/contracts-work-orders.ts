import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  AmendConstructionContractsWorkOrderRequestModel,
  ConstructionContractsWorkOrderFormOptionsResponseModel,
  ConstructionContractsWorkOrderSummaryModel,
  CreateConstructionContractsWorkOrderRequestModel,
  GetConstructionContractsWorkOrderResponseModel,
  ListConstructionContractsWorkOrderBoqItemsResponseModel,
  ListConstructionContractsWorkOrderMaterialOptionsResponseModel,
  ListConstructionContractsWorkOrdersResponseModel,
  UpdateConstructionContractsWorkOrderRequestModel,
} from "@/app/api/construction/contracts/work-orders/work-order-models";
import type { WorkOrderStatus } from "@/src/contracts/domain/contract-terms";

import { BOQ_KEY } from "./contracts-boq";
import { CONTRACTS_API, CONTRACTS_KEY } from "./contracts-access";
import { apiJson } from "./http";

export type WorkOrder = GetConstructionContractsWorkOrderResponseModel;
export type WorkOrderSummary = ConstructionContractsWorkOrderSummaryModel;
export type WorkOrderPage = ListConstructionContractsWorkOrdersResponseModel;
export type WorkOrderLine = WorkOrder["lines"][number];
export type WorkOrderMaterial = WorkOrder["materials"][number];
export type WorkOrderRevision = WorkOrder["revisions"][number];
export type WorkOrderWarning = WorkOrder["warnings"][number];
export type WorkOrderFormOptions =
  ConstructionContractsWorkOrderFormOptionsResponseModel;
export type WorkOrderBoqItems =
  ListConstructionContractsWorkOrderBoqItemsResponseModel;
export type WorkOrderBoqItem = WorkOrderBoqItems["items"][number];
export type WorkOrderMaterialOption =
  ListConstructionContractsWorkOrderMaterialOptionsResponseModel["items"][number];
export type WorkOrderInput = CreateConstructionContractsWorkOrderRequestModel;
export type WorkOrderUpdate = UpdateConstructionContractsWorkOrderRequestModel;
export type WorkOrderAmendment =
  AmendConstructionContractsWorkOrderRequestModel;

export const WORK_ORDERS_API = `${CONTRACTS_API}/work-orders`;

/** Every Work Order query key starts here (CM-1104). */
export const WORK_ORDERS_KEY = [...CONTRACTS_KEY, "work-orders"] as const;

/** `/app/projects/{id}/work-orders`, a Work Order, or one of its pages. */
export function workOrdersPath(
  projectId: string,
  id?: string,
  page?: "edit" | "amend",
): string {
  const base = `/app/projects/${projectId}/work-orders`;
  if (id == null) return base;
  return page == null ? `${base}/${id}` : `${base}/${id}/${page}`;
}

export const workOrderPdfUrl = (id: string) =>
  `${WORK_ORDERS_API}/${encodeURIComponent(id)}/pdf`;

export type WorkOrderFilters = {
  status: WorkOrderStatus | "";
  contractorId: string;
  search: string;
  cursor: { after: string } | { before: string } | null;
};

export function workOrdersQuery(projectId: string, filters: WorkOrderFilters) {
  const query = new URLSearchParams({ projectId });
  if (filters.status !== "") query.set("status", filters.status);
  if (filters.contractorId !== "")
    query.set("contractorId", filters.contractorId);
  if (filters.search.trim() !== "") query.set("q", filters.search.trim());
  if (filters.cursor != null) {
    if ("after" in filters.cursor) query.set("after", filters.cursor.after);
    else query.set("before", filters.cursor.before);
  }
  const text = query.toString();
  return queryOptions({
    queryKey: [...WORK_ORDERS_KEY, "list", text] as const,
    queryFn: () => apiJson<WorkOrderPage>(`${WORK_ORDERS_API}?${text}`),
  });
}

export function workOrderQuery(id: string) {
  return queryOptions({
    queryKey: [...WORK_ORDERS_KEY, "detail", id] as const,
    queryFn: () =>
      apiJson<WorkOrder>(`${WORK_ORDERS_API}/${encodeURIComponent(id)}`),
  });
}

/** Contractors on the Project, UoMs, TDS natures, SAC codes and GST rates. */
export function workOrderFormOptionsQuery(projectId: string) {
  return queryOptions({
    queryKey: [...WORK_ORDERS_KEY, "form-options", projectId] as const,
    queryFn: () =>
      apiJson<WorkOrderFormOptions>(
        `${WORK_ORDERS_API}/form-options?projectId=${encodeURIComponent(projectId)}`,
      ),
  });
}

/** The BOQ with what each item has left after the other Work Orders. */
export function workOrderBoqItemsQuery(
  projectId: string,
  workOrderId: string | null,
) {
  const query = new URLSearchParams({ projectId });
  if (workOrderId != null) query.set("workOrderId", workOrderId);
  const text = query.toString();
  return queryOptions({
    queryKey: [...WORK_ORDERS_KEY, "boq-items", text] as const,
    queryFn: () =>
      apiJson<WorkOrderBoqItems>(`${WORK_ORDERS_API}/boq-items?${text}`),
  });
}

/** Enabled Materials by name, for the materials issued. */
export function workOrderMaterialOptionsQuery(
  projectId: string,
  search: string,
) {
  const query = new URLSearchParams({ projectId });
  if (search.trim() !== "") query.set("q", search.trim());
  const text = query.toString();
  return queryOptions({
    queryKey: [...WORK_ORDERS_KEY, "materials", text] as const,
    queryFn: async () =>
      (
        await apiJson<ListConstructionContractsWorkOrderMaterialOptionsResponseModel>(
          `${WORK_ORDERS_API}/material-options?${text}`,
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

/** Work Order writes change remaining BOQ quantities too. */
function useInvalidateWorkOrders() {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({ queryKey: WORK_ORDERS_KEY }),
      client.invalidateQueries({ queryKey: BOQ_KEY }),
    ]);
}

export function useCreateWorkOrder() {
  const invalidate = useInvalidateWorkOrders();
  return useMutation({
    mutationFn: (input: WorkOrderInput) =>
      post<WorkOrder>(WORK_ORDERS_API, input),
    onSuccess: invalidate,
  });
}

export type WorkOrderSave =
  | { kind: "update"; input: WorkOrderUpdate }
  | { kind: "amend"; input: WorkOrderAmendment };

export function useSaveWorkOrder(id: string) {
  const invalidate = useInvalidateWorkOrders();
  return useMutation({
    mutationFn: (save: WorkOrderSave) =>
      post<WorkOrder>(
        `${WORK_ORDERS_API}/${encodeURIComponent(id)}/${save.kind}`,
        save.input,
      ),
    onSuccess: invalidate,
  });
}

export type WorkOrderCommand =
  | { kind: "submit" | "approve"; expectedUpdatedAt: string }
  | { kind: "reject" | "cancel"; reason: string; expectedUpdatedAt: string }
  | {
      kind: "close";
      closedOn: string;
      reason: string;
      expectedUpdatedAt: string;
    }
  | { kind: "delete"; expectedUpdatedAt: string };

export function useWorkOrderCommand(id: string) {
  const client = useQueryClient();
  const invalidate = useInvalidateWorkOrders();
  const detail = workOrderQuery(id).queryKey;
  return useMutation({
    mutationFn: ({ kind, ...body }: WorkOrderCommand) =>
      post<WorkOrder | null>(
        `${WORK_ORDERS_API}/${encodeURIComponent(id)}/${kind}`,
        body,
      ),
    onSuccess: (_saved, command) => {
      if (command.kind !== "delete") return invalidate();
      // The deleted Work Order's own page is left; refetching it would 404.
      return Promise.all([
        client.invalidateQueries({
          queryKey: WORK_ORDERS_KEY,
          predicate: (query) =>
            JSON.stringify(query.queryKey) !== JSON.stringify(detail),
        }),
        client.invalidateQueries({ queryKey: BOQ_KEY }),
      ]);
    },
  });
}
