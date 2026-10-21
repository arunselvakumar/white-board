import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { NewWorksheetPage } from "@/components/site-work/worksheets/worksheet-form-pages";
import {
  TitledFormSkeleton,
  WorksheetFormSkeleton,
} from "@/components/site-work/site-work-skeletons";

export const metadata: Metadata = { title: "Add Worksheet" };

/** Add Worksheet; `?from=<id>` duplicates a sheet (CM-0016 §9). */
export default async function NewWorksheetRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  if (
    !(await viewerCan("site_work.daily_worksheet", "create", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="new Daily Worksheets" />;
  const fromId =
    typeof from === "string" && /^[0-9a-f-]{36}$/i.test(from) ? from : null;
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <QuerySuspense
        fallback={
          <TitledFormSkeleton
            title={fromId == null ? "Add Worksheet" : "Duplicate Worksheet"}
          >
            <WorksheetFormSkeleton />
          </TitledFormSkeleton>
        }
      >
        <NewWorksheetPage projectId={id} fromId={fromId} />
      </QuerySuspense>
    </div>
  );
}
