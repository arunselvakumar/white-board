"use client";

import { PencilSimpleSlashIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { EmptyState } from "@repo/ui/components/empty-state";

import { purchaseOrderQuery } from "@/src/queries/purchase-orders";

import { PurchaseOrderForm } from "@/app/app/projects/[id]/materials/purchase-orders/_components/purchase-order-form";

/** Edit Purchase Order: not yet ordered or closed (ADR CM-0015 §2). */
export function EditPurchaseOrder({
  projectId,
  id,
  today,
}: {
  projectId: string;
  id: string;
  today?: string;
}) {
  const { data } = useSuspenseQuery(purchaseOrderQuery(id));
  if (!data.actions.edit)
    return (
      <EmptyState
        className="bg-card border"
        icon={PencilSimpleSlashIcon}
        tone="neutral"
        orbit={false}
        title={`${data.number} cannot be edited`}
        description="An ordered or closed Purchase Order is not edited: close it and raise a new one."
      />
    );
  return (
    <div className="w-full space-y-4">
      <h2 className="text-lg font-semibold">Edit {data.number}</h2>
      {data.approvalStatus === "approved" && (
        <p className="text-muted-foreground text-sm">
          Saving an approved order sends it back for approval.
        </p>
      )}
      <PurchaseOrderForm
        projectId={projectId}
        existing={data}
        {...(today == null ? {} : { today })}
      />
    </div>
  );
}
