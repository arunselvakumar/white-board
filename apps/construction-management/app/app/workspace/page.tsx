import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { WorkspaceIndex } from "@/components/app-shell/workspace-index";

export const metadata: Metadata = { title: "Workspace" };

/** The Workspace index, with the tiles the viewer may read. */
export default async function WorkspacePage() {
  const [centralStore, centralInventory] = await Promise.all([
    viewerCan("procurement.central_store", "read"),
    viewerCan("procurement.central_inventory", "read"),
  ]);
  return (
    <WorkspaceIndex
      centralStore={centralStore}
      centralInventory={centralInventory}
    />
  );
}
