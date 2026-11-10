import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { InspectionsList } from "@/app/app/projects/[id]/inspections/_components/inspections-list";

export const metadata: Metadata = { title: "Inspections" };

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
