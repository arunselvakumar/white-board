import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import type { ConstructionProcurementMaterialRequestResponseModel } from "@/app/api/construction/procurement/material-requests/material-request-models";
import type { ConstructionContractsWorkOrderReconciliationResponseModel } from "@/app/api/construction/contracts/work-orders/reconciliation-models";

import { CONTRACTS_KEY } from "./contracts-access";
import { WORK_ORDERS_API, WORK_ORDERS_KEY } from "./contracts-work-orders";
import { apiJson } from "./http";
import { MATERIAL_REQUESTS_API } from "./material-requests";
import { PROCUREMENT_KEY } from "./procurement-access";

export type Reconciliation =
  ConstructionContractsWorkOrderReconciliationResponseModel;
export type ReconciliationMaterial = Reconciliation["materials"][number];
export type ReconciliationIssue = Reconciliation["issues"][number];
export type UnattributedIssue = Reconciliation["unattributed"][number];

/** Material reconciliation statements (CM-1110). */
export const RECONCILIATION_KEY = [
  ...WORK_ORDERS_KEY,
  "reconciliation",
] as const;

/** A Work Order's statement at a running bill (null: the default bill). */
export function reconciliationQuery(
  workOrderId: string,
  billId: string | null,
) {
  return queryOptions({
    queryKey: [
      ...RECONCILIATION_KEY,
      workOrderId,
      billId ?? "default",
    ] as const,
    queryFn: () =>
      apiJson<Reconciliation>(
        `${WORK_ORDERS_API}/${encodeURIComponent(workOrderId)}/reconciliation${
          billId == null ? "" : `?billId=${encodeURIComponent(billId)}`
        }`,
      ),
  });
}

export const reconciliationPdfUrl = (
  workOrderId: string,
  billId: string | null,
) =>
  `${WORK_ORDERS_API}/${encodeURIComponent(workOrderId)}/reconciliation/pdf${
    billId == null ? "" : `?billId=${encodeURIComponent(billId)}`
  }`;

/**
 * Names the Work Order an unattributed issue's Material Request was issued
 * under (procurement's command); every statement and bill refetches.
 */
export function useAssignIssueToWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { materialRequestId: string; workOrderId: string }) =>
      apiJson<ConstructionProcurementMaterialRequestResponseModel>(
        `${MATERIAL_REQUESTS_API}/${encodeURIComponent(input.materialRequestId)}/assign-work-order`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workOrderId: input.workOrderId }),
        },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CONTRACTS_KEY }),
        queryClient.invalidateQueries({ queryKey: PROCUREMENT_KEY }),
      ]);
    },
  });
}
