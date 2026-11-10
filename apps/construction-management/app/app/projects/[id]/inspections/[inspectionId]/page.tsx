import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { InspectionDetail } from "@/app/app/projects/[id]/inspections/[inspectionId]/_components/inspection-detail";
import { InspectionDetailSkeleton } from "@/app/app/projects/[id]/_components/tracking/tracking-skeletons";

export const metadata: Metadata = { title: "Inspection Request" };

export default async function InspectionRoute({
  params,
}: {
  params: Promise<{ id: string; inspectionId: string }>;
}) {
  const { id, inspectionId } = await params;
  if (
    !(await viewerCan("tracking.inspection_requests", "read", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="Inspection Requests" />;
  return (
    <QuerySuspense fallback={<InspectionDetailSkeleton projectId={id} />}>
      <InspectionDetail projectId={id} id={inspectionId} />
    </QuerySuspense>
  );
}
