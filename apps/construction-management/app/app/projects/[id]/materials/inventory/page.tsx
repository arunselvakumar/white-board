import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { InventoryPage } from "@/components/procurement/inventory/inventory-page";
import { ProjectNoAccess } from "@/components/projects/files/project-no-access";

export const metadata: Metadata = { title: "Current Inventory" };

/** The Project's Current Inventory (CM-506). */
export default async function ProjectInventoryRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (
    !(await viewerCan("procurement.current_inventory", "read", {
      projectId: id,
    }))
  )
    return <ProjectNoAccess what="Current Inventory" />;
  return <InventoryPage location={{ kind: "project", id }} />;
}
