import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { TestingReportsPage } from "@/app/app/projects/[id]/testing-reports/_components/testing-reports-page";
import { QuerySuspense } from "@/components/query-suspense";
import { TestingReportsSkeleton } from "@/app/app/projects/[id]/testing-reports/_components/testing-reports-skeletons";

export const metadata: Metadata = { title: "Testing reports" };

/** The Project's testing materials and their report counts. */
export default async function ProjectTestingReportsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!(await viewerCan("projects.testing_reports", "read")))
    return <ProjectNoAccess what="Testing reports" />;
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    viewerCan("projects.testing_reports", "create", { projectId: id }),
    viewerCan("projects.testing_reports", "update", { projectId: id }),
    viewerCan("projects.testing_reports", "delete", { projectId: id }),
  ]);
  return (
    <QuerySuspense fallback={<TestingReportsSkeleton />}>
      <TestingReportsPage
        projectId={id}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </QuerySuspense>
  );
}
