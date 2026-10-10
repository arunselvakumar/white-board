import { Prisma } from "@repo/construction-db";

import { orderStatusOf } from "../domain/purchase-request";

type Db = Prisma.TransactionClient;

/**
 * Keeps a Purchase Request's fulfilment in step with its Purchase Orders
 * (CM-504, ADR CM-0015 §2). Call it inside every transaction that creates,
 * edits, rejects or deletes a PO, with the PRs the PO pointed at before
 * and after. For each PR it locks the row, sets every item's
 * `ordered_qty` to Σ quantity of live, non-rejected PO lines pointing at
 * it, and derives `order_status` (Mark as Ordered keeps it `ordered`).
 *
 * The PO side owns `ordered_qty` and `order_status`; Goods Receipts own
 * `received_qty` and `receipt_status` and never call this.
 */
export async function recomputePurchaseRequestOrdering(
  tx: Db,
  workspaceId: string,
  purchaseRequestIds: readonly (string | null | undefined)[],
): Promise<void> {
  const ids = [
    ...new Set(purchaseRequestIds.filter((id): id is string => id != null)),
  ].sort();
  if (ids.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM construction_procurement.purchase_requests
    WHERE workspace_id = ${workspaceId} AND id = ANY(${ids}::uuid[])
    ORDER BY id
    FOR UPDATE`;
  await tx.$executeRaw`
    UPDATE construction_procurement.purchase_request_items AS item
    SET ordered_qty = COALESCE((
      SELECT SUM(line.quantity)
      FROM construction_procurement.purchase_order_items line
      JOIN construction_procurement.purchase_orders po ON po.id = line.purchase_order_id
      WHERE line.purchase_request_item_id = item.id
        AND po.deleted_at IS NULL
        AND po.approval_status <> 'rejected'
    ), 0)
    WHERE item.purchase_request_id = ANY(${ids}::uuid[])`;
  const requests = await tx.constructionProcurementPurchaseRequest.findMany({
    where: { workspaceId, id: { in: ids } },
    select: {
      id: true,
      orderStatus: true,
      markedOrderedAt: true,
      items: { select: { quantity: true, orderedQty: true } },
    },
  });
  for (const request of requests) {
    const status = orderStatusOf(
      request.items.map((item) => ({
        quantity: item.quantity.toFixed(3),
        orderedQty: item.orderedQty.toFixed(3),
      })),
      request.markedOrderedAt != null,
    );
    if (status !== request.orderStatus)
      await tx.constructionProcurementPurchaseRequest.update({
        where: { id: request.id },
        data: { orderStatus: status },
      });
  }
}
