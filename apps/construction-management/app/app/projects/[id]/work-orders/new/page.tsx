import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { WorkOrderNew } from "@/components/contracts/work-orders/work-order-pages";
import { WorkOrderFormSkeleton } from "@/components/contracts/work-orders/work-orders-skeletons";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "New Work Order" };

/** A new draft Work Order (CM-1104). */
export default async function WorkOrderNewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("contracts.work_orders", "create", { projectId: id })))
    return <ProjectNoAccess what="adding Work Orders" />;
  return (
    <div className="w-full p-6">
      <QuerySuspense
        fallback={
          <WorkOrderFormSkeleton projectId={id} title="New Work Order" />
        }
      >
        <WorkOrderNew projectId={id} />
      </QuerySuspense>
    </div>
  );
}
