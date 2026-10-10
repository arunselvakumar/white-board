"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@repo/ui/components/empty";

import { purchaseRequestQuery } from "@/src/queries/purchase-requests";

import { PurchaseRequestWizard } from "./purchase-request-wizard";

/** Edit Purchase Request: the wizard on a pending or rejected request (CM-503). */
export function EditPurchaseRequest({
  projectId,
  id,
  today,
}: {
  projectId: string;
  id: string;
  today?: string;
}) {
  const { data } = useSuspenseQuery(purchaseRequestQuery(id));
  if (!data.actions.edit)
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>{data.number} cannot be edited</EmptyTitle>
          <EmptyDescription>
            Only pending or rejected Purchase Requests are edited, by members with
            Update on Purchase Requests.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="w-full space-y-4">
      <h2 className="text-lg font-semibold">Edit {data.number}</h2>
      <PurchaseRequestWizard
        projectId={projectId}
        existing={data}
        {...(today == null ? {} : { today })}
      />
    </div>
  );
}
