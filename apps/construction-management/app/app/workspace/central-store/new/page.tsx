import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { StoreForm } from "@/app/app/workspace/central-store/_components/store-form";
import { StoreFormSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Add store" };

export default async function NewStoreRoute() {
  if (!(await viewerCan("procurement.central_store", "create")))
    return <ProjectNoAccess what="adding stores" />;
  return (
    <QuerySuspense fallback={<StoreFormSkeleton />}>
      <StoreForm />
    </QuerySuspense>
  );
}
