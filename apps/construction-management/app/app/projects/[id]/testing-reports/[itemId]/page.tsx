import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { TestingItemPage } from "@/components/projects/testing-reports/testing-item-page";

export const metadata: Metadata = { title: "Testing reports" };

/** One testing material's reports (CM-409). */
export default async function ProjectTestingItemRoute({
  params,
}: {
  params: Promise<{ id: string; itemId: string }>;
}) {
  const { id, itemId } = await params;
  if (!(await viewerCan("projects.testing_reports", "read")))
    return <ProjectNoAccess what="Testing reports" />;
  const [canCreate, canUpdate, canDelete] = await Promise.all([
    viewerCan("projects.testing_reports", "create", { projectId: id }),
    viewerCan("projects.testing_reports", "update", { projectId: id }),
    viewerCan("projects.testing_reports", "delete", { projectId: id }),
  ]);
  return (
    <TestingItemPage
      projectId={id}
      itemId={itemId}
      canCreate={canCreate}
      canUpdate={canUpdate}
      canDelete={canDelete}
    />
  );
}
