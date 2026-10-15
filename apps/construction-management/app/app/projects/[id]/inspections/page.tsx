import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { InspectionsList } from "@/components/tracking/inspections/inspections-list";

export const metadata: Metadata = { title: "Inspections" };

/** The Project's Inspection Requests (CM-804). */
export default async function InspectionsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("tracking.inspection_requests", "read", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="Inspection Requests" />;
  return (
    <div className="flex w-full max-w-6xl min-w-0 flex-col gap-4 p-6">
      <InspectionsList projectId={id} />
    </div>
  );
}
