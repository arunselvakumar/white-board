import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { TestingReportsPage } from "@/components/projects/testing-reports/testing-reports-page";

export const metadata: Metadata = { title: "Testing reports" };

/** The Project's testing materials and their report counts (CM-409). */
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
    <TestingReportsPage
      projectId={id}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
    />
  );
}
