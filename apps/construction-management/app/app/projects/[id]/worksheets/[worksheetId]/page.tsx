import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { QuerySuspense } from "@/components/query-suspense";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { WorksheetDetailPage } from "@/components/site-work/worksheets/worksheet-detail";
import { WorksheetDetailSkeleton } from "@/components/site-work/site-work-skeletons";

export const metadata: Metadata = { title: "Daily Worksheet" };

/** One Daily Worksheet (CM-602). */
export default async function WorksheetRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; worksheetId: string }>;
  searchParams: Promise<{ uploadFailed?: string | string[] }>;
}) {
  const { id, worksheetId } = await params;
  const { uploadFailed } = await searchParams;
  const failed =
    typeof uploadFailed === "string"
      ? uploadFailed
          .split("\n")
          .map((name) => name.trim())
          .filter((name) => name !== "")
          .slice(0, 20)
      : [];
  if (
    !(await viewerCan("site_work.daily_worksheet", "read", { projectId: id }))
  )
    return <ProjectNoAccess what="the Daily Worksheet" />;
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <QuerySuspense fallback={<WorksheetDetailSkeleton projectId={id} />}>
        <WorksheetDetailPage
          projectId={id}
          id={worksheetId}
          uploadFailed={failed}
        />
      </QuerySuspense>
    </div>
  );
}
