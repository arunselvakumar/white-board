import { Badge } from "@repo/ui/components/badge";

import type { PurchaseOrder } from "@/src/queries/purchase-orders";

/** Words and badges the Purchase Order screens share (CM-504). */

export const STAGE_LABELS = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  ordered: "Ordered",
  closed: "Closed",
} as const;

export const RECEIPT_LABELS = {
  not_received: "Not received",
  partially_received: "Partially received",
  received: "Received",
} as const;

export function StageBadge({ stage }: { stage: PurchaseOrder["stage"] }) {
  return (
    <Badge
      variant={
        stage === "rejected"
          ? "destructive"
          : stage === "pending"
            ? "secondary"
            : stage === "closed"
              ? "outline"
              : "default"
      }
    >
      {STAGE_LABELS[stage]}
    </Badge>
  );
}

/** Receipt status matters once the PO is ordered. */
export function ReceiptBadge({ po }: { po: PurchaseOrder }) {
  if (po.orderedAt == null) return null;
  return <Badge variant="outline">{RECEIPT_LABELS[po.receiptStatus]}</Badge>;
}

export function purchaseOrdersPath(projectId: string, rest = ""): string {
  return `/app/projects/${encodeURIComponent(projectId)}/materials/purchase-orders${rest}`;
}
