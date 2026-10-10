import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { CentralInventoryPage } from "@/components/procurement/central-inventory/central-inventory-page";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Central Inventory" };

/** Workspace → Central Inventory (CM-509). */
export default async function CentralInventoryRoute() {
  if (!(await viewerCan("procurement.central_inventory", "read")))
    return <ProjectNoAccess what="Central Inventory" />;
  return <CentralInventoryPage />;
}
