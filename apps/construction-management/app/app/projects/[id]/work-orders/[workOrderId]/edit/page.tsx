import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { WorkOrderChange } from "@/components/contracts/work-orders/work-order-pages";
import { WorkOrderFormSkeleton } from "@/components/contracts/work-orders/work-orders-skeletons";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Work Order" };

/** Edit a draft Work Order (CM-1104): Update, or Create for its creator. */
export default async function WorkOrderEditPage({
  params,
}: {
  params: Promise<{ id: string; workOrderId: string }>;
}) {
  const { id, workOrderId } = await params;
  const scope = { projectId: id };
  const allowed =
    (await viewerCan("contracts.work_orders", "update", scope)) ||
    (await viewerCan("contracts.work_orders", "create", scope));
  if (!allowed) return <ProjectNoAccess what="editing Work Orders" />;
  return (
    <div className="w-full p-6">
      <QuerySuspense
        fallback={
          <WorkOrderFormSkeleton projectId={id} title="Edit Work Order" />
        }
      >
        <WorkOrderChange projectId={id} id={workOrderId} mode="edit" />
      </QuerySuspense>
    </div>
  );
}
