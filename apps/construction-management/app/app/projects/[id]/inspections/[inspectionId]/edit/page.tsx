import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { InspectionEdit } from "@/components/tracking/inspections/inspection-pages";
import { TrackingFormSkeleton } from "@/components/tracking/tracking-skeletons";

export const metadata: Metadata = { title: "Edit Inspection Request" };

/** Edit a pending Inspection Request. */
export default async function EditInspectionRoute({
  params,
}: {
  params: Promise<{ id: string; inspectionId: string }>;
}) {
  const { id, inspectionId } = await params;
  if (
    !(await viewerCan("tracking.inspection_requests", "update", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="editing Inspection Requests" />;
  return (
    <QuerySuspense
      fallback={<TrackingFormSkeleton kind="inspection" projectId={id} />}
    >
      <InspectionEdit projectId={id} inspectionId={inspectionId} />
    </QuerySuspense>
  );
}
