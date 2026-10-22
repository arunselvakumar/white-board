import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { WorkOrderChange } from "@/components/contracts/work-orders/work-order-pages";
import { WorkOrderFormSkeleton } from "@/components/contracts/work-orders/work-orders-skeletons";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Amend Work Order" };

/** Amend an issued Work Order (CM-1104): Update and Approve. */
export default async function WorkOrderAmendPage({
  params,
}: {
  params: Promise<{ id: string; workOrderId: string }>;
}) {
  const { id, workOrderId } = await params;
  const scope = { projectId: id };
  const allowed =
    (await viewerCan("contracts.work_orders", "update", scope)) &&
    (await viewerCan("contracts.work_orders", "approve", scope));
  if (!allowed) return <ProjectNoAccess what="amending Work Orders" />;
  return (
    <div className="w-full p-6">
      <QuerySuspense
        fallback={
          <WorkOrderFormSkeleton projectId={id} title="Amend Work Order" />
        }
      >
        <WorkOrderChange projectId={id} id={workOrderId} mode="amend" />
      </QuerySuspense>
    </div>
  );
}
