"use client";

import { PencilSimpleSlashIcon } from "@phosphor-icons/react/ssr";
import { useSuspenseQuery } from "@tanstack/react-query";
import { EmptyState } from "@repo/ui/components/empty-state";

import { purchaseRequestQuery } from "@/src/queries/purchase-requests";

import { PurchaseRequestWizard } from "@/app/app/projects/[id]/materials/purchase-requests/_components/purchase-request-wizard";

/** Edit Purchase Request: the wizard on a pending or rejected request. */
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
      <EmptyState
        className="bg-card border"
        icon={PencilSimpleSlashIcon}
        tone="neutral"
        orbit={false}
        title={`${data.number} cannot be edited`}
        description="Only pending or rejected Purchase Requests are edited, by members with Update on Purchase Requests."
      />
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
