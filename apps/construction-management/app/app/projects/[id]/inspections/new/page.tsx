import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import {
  InspectionNew,
  InspectionReinspect,
} from "@/components/tracking/inspections/inspection-pages";
import { TrackingFormSkeleton } from "@/components/tracking/tracking-skeletons";

export const metadata: Metadata = { title: "Add Inspection Request" };

/**
 * Add Inspection Request (CM-804); `?reinspect=<id>` is **Raise
 * re-inspection** of a rejected request, prefilled from it.
 */
export default async function NewInspectionRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ reinspect?: string | string[] }>;
}) {
  const { id } = await params;
  const { reinspect } = await searchParams;
  if (
    !(await viewerCan("tracking.inspection_requests", "create", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="new Inspection Requests" />;
  const originalId =
    typeof reinspect === "string" && /^[0-9a-f-]{36}$/i.test(reinspect)
      ? reinspect
      : null;
  return (
    <QuerySuspense
      fallback={
        <TrackingFormSkeleton
          kind="inspection"
          projectId={id}
          title={
            originalId == null
              ? "Add Inspection Request"
              : "Raise re-inspection"
          }
        />
      }
    >
      {originalId == null ? (
        <InspectionNew projectId={id} />
      ) : (
        <InspectionReinspect projectId={id} originalId={originalId} />
      )}
    </QuerySuspense>
  );
}
