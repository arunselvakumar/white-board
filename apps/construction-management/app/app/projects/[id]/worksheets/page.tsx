import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { WorksheetsPage } from "@/components/site-work/worksheets/worksheets-page";

export const metadata: Metadata = { title: "Daily Worksheet" };

/** The Project's Daily Worksheets (CM-602). */
export default async function ProjectWorksheetsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("site_work.daily_worksheet", "read", { projectId: id }))
  )
    return <ProjectNoAccess what="the Daily Worksheet" />;
  return (
    <div className="flex w-full max-w-6xl flex-col gap-4 p-6">
      <WorksheetsPage projectId={id} />
    </div>
  );
}
