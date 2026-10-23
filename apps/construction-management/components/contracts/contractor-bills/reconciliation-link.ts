import { workOrdersPath } from "@/src/queries/contracts-work-orders";

/** The Work Order's material reconciliation at this bill (CM-1110). */
export function reconciliationHref(bill: {
  id: string;
  projectId: string;
  workOrderId: string;
}): string {
  return `${workOrdersPath(bill.projectId, bill.workOrderId)}?billId=${encodeURIComponent(bill.id)}#reconciliation`;
}
