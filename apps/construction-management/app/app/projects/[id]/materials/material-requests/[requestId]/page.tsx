import type { Metadata } from "next";

import { MaterialRequestDetail } from "@/components/procurement/material-requests/material-request-detail";
import { MaterialRequestDetailSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Material Request" };

/** One Material Request of the Project. */
export default async function MaterialRequestRoute({
  params,
}: {
  params: Promise<{ id: string; requestId: string }>;
}) {
  const { id, requestId } = await params;
  return (
    <QuerySuspense
      fallback={
        <MaterialRequestDetailSkeleton
          back={{
            label: "Material Requests",
            href: `/app/projects/${encodeURIComponent(id)}/materials/material-requests`,
          }}
        />
      }
    >
      <MaterialRequestDetail requestId={requestId} side="project" />
    </QuerySuspense>
  );
}
