import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { ProgressReportsPage } from "@/components/site-work/progress-reports/progress-reports-page";

export const metadata: Metadata = { title: "Progress Reports" };

/** The Project's Progress Reports: Daily Progress Reports (CM-606). */
export default async function ProgressReportsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("site_work.progress_reports", "read", { projectId: id }))
  )
    return <ProjectNoAccess what="Progress Reports" />;
  return <ProgressReportsPage projectId={id} />;
}
