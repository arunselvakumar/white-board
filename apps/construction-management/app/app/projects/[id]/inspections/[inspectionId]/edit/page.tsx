import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { InspectionEdit } from "@/components/tracking/inspections/inspection-pages";

export const metadata: Metadata = { title: "Edit Inspection Request" };

/** Edit a pending Inspection Request (CM-804). */
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
    <QuerySuspense>
      <InspectionEdit projectId={id} inspectionId={inspectionId} />
    </QuerySuspense>
  );
}
