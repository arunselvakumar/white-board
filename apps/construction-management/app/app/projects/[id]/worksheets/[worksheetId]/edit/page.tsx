import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { EditWorksheetPage } from "@/components/site-work/worksheets/worksheet-form-pages";
import { WorksheetFormSkeleton } from "@/components/site-work/site-work-skeletons";
import { EditDocumentSkeleton } from "@/components/procurement/procurement-skeletons";

export const metadata: Metadata = { title: "Edit Worksheet" };

/** Edit a Daily Worksheet (CM-602). */
export default async function EditWorksheetRoute({
  params,
}: {
  params: Promise<{ id: string; worksheetId: string }>;
}) {
  const { id, worksheetId } = await params;
  if (
    !(await viewerCan("site_work.daily_worksheet", "update", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="editing Daily Worksheets" />;
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <QuerySuspense
        fallback={
          <EditDocumentSkeleton>
            <WorksheetFormSkeleton />
          </EditDocumentSkeleton>
        }
      >
        <EditWorksheetPage projectId={id} id={worksheetId} />
      </QuerySuspense>
    </div>
  );
}
