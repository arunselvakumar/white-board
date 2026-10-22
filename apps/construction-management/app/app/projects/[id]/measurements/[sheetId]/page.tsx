import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { MeasurementSheetPage } from "@/components/contracts/measurements/measurement-sheet";
import { MeasurementSheetSkeleton } from "@/components/contracts/measurements/measurements-skeletons";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Measurement sheet" };

/** One measurement sheet (CM-1105); `measurement.submitted` links here. */
export default async function MeasurementSheetRoute({
  params,
}: {
  params: Promise<{ id: string; sheetId: string }>;
}) {
  const { id, sheetId } = await params;
  if (!(await viewerCan("contracts.measurements", "read", { projectId: id })))
    return <ProjectNoAccess what="Measurements" />;
  return (
    <div className="w-full p-6">
      <QuerySuspense fallback={<MeasurementSheetSkeleton projectId={id} />}>
        <MeasurementSheetPage projectId={id} id={sheetId} />
      </QuerySuspense>
    </div>
  );
}
