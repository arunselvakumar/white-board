import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectMaterialRequestsPage } from "@/components/procurement/material-requests/project-material-requests-page";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Material Requests" };

/** Materials → Material Requests: what the Project asked its stores for (CM-508). */
export default async function MaterialRequestsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("procurement.material_requests", "read")))
    return <ProjectNoAccess what="Material Requests" />;
  const canCreate = await viewerCan("procurement.material_requests", "create");
  return <ProjectMaterialRequestsPage projectId={id} canCreate={canCreate} />;
}
