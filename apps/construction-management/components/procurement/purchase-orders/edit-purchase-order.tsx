"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { purchaseOrderQuery } from "@/src/queries/purchase-orders";

import { PurchaseOrderForm } from "./purchase-order-form";

/** Edit Purchase Order: not yet ordered or closed (CM-0015 §2). */
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
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{data.number} cannot be edited</EmptyTitle>
          <EmptyDescription>
            An ordered or closed Purchase Order is not edited: close it and
            raise a new one.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
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
