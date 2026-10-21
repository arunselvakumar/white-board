import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { MaterialRequestForm } from "@/components/procurement/material-requests/material-request-form";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { MaterialRequestFormSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Raise Material Request" };

export default async function NewMaterialRequestRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("procurement.material_requests", "create")))
    return <ProjectNoAccess what="raising Material Requests" />;
  return (
    <QuerySuspense
      fallback={
        <MaterialRequestFormSkeleton
          projectId={id}
          title="Raise Material Request"
        />
      }
    >
      <MaterialRequestForm projectId={id} />
    </QuerySuspense>
  );
}
