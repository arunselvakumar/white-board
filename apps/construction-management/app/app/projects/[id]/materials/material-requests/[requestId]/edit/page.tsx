import type { Metadata } from "next";

import { EditMaterialRequestPage } from "@/app/app/projects/[id]/materials/material-requests/[requestId]/edit/_components/edit-material-request-page";
import { MaterialRequestFormSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Material Request" };

export default async function EditMaterialRequestRoute({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  return (
    <QuerySuspense fallback={<MaterialRequestFormSkeleton projectId={id} />}>
      <EditMaterialRequestPage projectId={id} requestId={requestId} />
    </QuerySuspense>
  );
}
