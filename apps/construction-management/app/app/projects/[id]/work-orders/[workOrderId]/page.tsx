import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { WorkOrderDetail } from "@/components/contracts/work-orders/work-order-detail";
import { WorkOrderDetailSkeleton } from "@/components/contracts/work-orders/work-orders-skeletons";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Work Order" };

/** One Work Order with its revisions (CM-1104); approval notices link here. */
export default async function WorkOrderPage({
  params,
}: {
  params: Promise<{ id: string; workOrderId: string }>;
}) {
  const { id, workOrderId } = await params;
  if (!(await viewerCan("contracts.work_orders", "read", { projectId: id })))
    return <ProjectNoAccess what="Work Orders" />;
  return (
    <div className="w-full p-6">
      <QuerySuspense fallback={<WorkOrderDetailSkeleton projectId={id} />}>
        <WorkOrderDetail projectId={id} id={workOrderId} />
      </QuerySuspense>
    </div>
  );
}
