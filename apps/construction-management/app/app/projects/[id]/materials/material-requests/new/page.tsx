import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { MaterialRequestForm } from "@/components/procurement/material-requests/material-request-form";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Raise Material Request" };

export default async function NewMaterialRequestRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("procurement.material_requests", "create")))
    return <ProjectNoAccess what="raising Material Requests" />;
  return <MaterialRequestForm projectId={id} />;
}
