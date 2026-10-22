import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { WorkOrdersList } from "@/components/contracts/work-orders/work-orders-list";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Work Orders" };

/** The Project's Work Orders (CM-1104, ADR CM-0023 §5). */
export default async function WorkOrdersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("contracts.work_orders", "read", { projectId: id })))
    return <ProjectNoAccess what="Work Orders" />;
  const canCreate = await viewerCan("contracts.work_orders", "create", {
    projectId: id,
  });
  return <WorkOrdersList projectId={id} canCreate={canCreate} />;
}
