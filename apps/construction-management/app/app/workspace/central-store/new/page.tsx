import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";
import { StoreForm } from "@/components/procurement/stores/store-form";
import { StoreFormSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Add store" };

/** Add store (Central store create). */
export default async function NewStoreRoute() {
  if (!(await viewerCan("procurement.central_store", "create")))
    return <ProjectNoAccess what="adding stores" />;
  return (
    <QuerySuspense fallback={<StoreFormSkeleton />}>
      <StoreForm />
    </QuerySuspense>
  );
}
