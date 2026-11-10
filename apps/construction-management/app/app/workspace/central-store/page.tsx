import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { StoresPage } from "@/app/app/workspace/central-store/_components/stores-page";
import { StoresPageSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Central Store" };

export default async function CentralStoreRoute() {
  if (!(await viewerCan("procurement.central_store", "read")))
    return <ProjectNoAccess what="Central Store" />;
  return (
    <QuerySuspense fallback={<StoresPageSkeleton />}>
      <StoresPage />
    </QuerySuspense>
  );
}
