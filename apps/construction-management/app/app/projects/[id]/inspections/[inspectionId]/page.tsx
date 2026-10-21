import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { InspectionDetail } from "@/components/tracking/inspections/inspection-detail";
import { InspectionDetailSkeleton } from "@/components/tracking/tracking-skeletons";

export const metadata: Metadata = { title: "Inspection Request" };

/** One Inspection Request (CM-804). */
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
