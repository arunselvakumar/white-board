import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { MeasurementNew } from "@/components/contracts/measurements/measurement-sheet";
import { MeasurementSheetSkeleton } from "@/components/contracts/measurements/measurements-skeletons";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "New measurement sheet" };

/** A new draft sheet (CM-1105): `?side=contractor` for a Work Order. */
export default async function MeasurementNewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string }>;
}) {
  const { id } = await params;
  const side =
    (await searchParams).side === "contractor" ? "contractor" : "client";
  if (!(await viewerCan("contracts.measurements", "create", { projectId: id })))
    return <ProjectNoAccess what="adding measurement sheets" />;
  return (
    <div className="w-full p-6">
      <QuerySuspense
        fallback={
          <MeasurementSheetSkeleton
            projectId={id}
            title={
              side === "client"
                ? "New client-side sheet"
                : "New contractor-side sheet"
            }
          />
        }
      >
        <MeasurementNew projectId={id} side={side} />
      </QuerySuspense>
    </div>
  );
}
