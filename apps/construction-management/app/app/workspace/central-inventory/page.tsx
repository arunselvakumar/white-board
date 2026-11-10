import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { CentralInventoryPage } from "@/app/app/workspace/central-inventory/_components/central-inventory-page";
import { ProjectNoAccess } from "@/app/app/_components/projects/files/project-no-access";
import { CentralInventorySkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Central Inventory" };

export default async function CentralInventoryRoute() {
  if (!(await viewerCan("procurement.central_inventory", "read")))
    return <ProjectNoAccess what="Central Inventory" />;
  return (
    <QuerySuspense fallback={<CentralInventorySkeleton />}>
      <CentralInventoryPage />
    </QuerySuspense>
  );
}
