import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { TestingItemPage } from "@/app/app/projects/[id]/testing-reports/[itemId]/_components/testing-item-page";
import { QuerySuspense } from "@/components/query-suspense";
import { TestingItemSkeleton } from "@/app/app/projects/[id]/testing-reports/_components/testing-reports-skeletons";

export const metadata: Metadata = { title: "Testing reports" };

/** One testing material's reports. */
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
    <QuerySuspense fallback={<TestingItemSkeleton projectId={id} />}>
      <TestingItemPage
        projectId={id}
        itemId={itemId}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
      />
    </QuerySuspense>
  );
}
