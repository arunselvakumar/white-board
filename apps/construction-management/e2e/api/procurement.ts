import type { ApiClient } from "./ApiClient";
import { todayInIndia } from "./dates";

const PROCUREMENT = "/api/construction/procurement";

/**
 * A standalone Goods Receipt on the Project: `quantity` of the Material in
 * stock from today. Posting it also bills the Supplier (CM-705).
 */
export async function receiveGoods(
  api: ApiClient,
  input: {
    projectId: string;
    supplierId: string;
    materialId: string;
    quantity: string;
    rateRupees?: number;
    invoiceNo?: string;
  },
): Promise<{ id: string; number: string }> {
  const today = todayInIndia();
  return api.post(`${PROCUREMENT}/goods-receipts`, {
    locationKind: "project",
    locationId: input.projectId,
    receiptDate: today,
    inventoryDate: today,
    supplierId: input.supplierId,
    supplyType: "intra_state",
    invoiceNo: input.invoiceNo ?? null,
    invoiceDate: input.invoiceNo == null ? null : today,
    lines: [
      {
        materialId: input.materialId,
        quantity: input.quantity,
        unitRate: (input.rateRupees ?? 400) * 100,
        gstRate: "18",
        hsnCode: "2523",
      },
    ],
  });
}
