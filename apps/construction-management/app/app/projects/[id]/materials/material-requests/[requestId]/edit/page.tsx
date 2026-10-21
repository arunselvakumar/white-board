import type { Metadata } from "next";

import { EditMaterialRequestPage } from "@/components/procurement/material-requests/edit-material-request-page";
import { MaterialRequestFormSkeleton } from "@/components/procurement/procurement-skeletons";
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
