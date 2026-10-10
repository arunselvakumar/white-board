import type { Metadata } from "next";
import { ItemGroup } from "@repo/ui/components/item";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { PageHeader } from "@/components/app-shell/page-header";
import { HrmsWorkspaceTile } from "@/components/hrms/hrms-workspace-tile";
import {
  CentralInventoryWorkspaceTile,
  CentralStoreWorkspaceTile,
} from "@/components/procurement/stores/central-store-workspace-tiles";

export const metadata: Metadata = { title: "Workspace" };

/**
 * Work across all Projects (`docs/00-overview.md`): HRMS with today's
 * headline numbers (CM-319), Central Store (CM-508) and Central Inventory
 * (CM-509) for members who may read them; Central Payment and Central
 * Reports follow.
 */
export default async function WorkspacePage() {
  const [centralStore, centralInventory] = await Promise.all([
    viewerCan("procurement.central_store", "read"),
    viewerCan("procurement.central_inventory", "read"),
  ]);
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader title="Workspace" meta="Work across all your Projects." />
        <ItemGroup className="grid gap-3 sm:grid-cols-2">
          <div role="listitem" className="flex">
            <HrmsWorkspaceTile />
          </div>
          {centralStore ? (
            <div role="listitem" className="flex">
              <CentralStoreWorkspaceTile />
            </div>
          ) : null}
          {centralInventory ? (
            <div role="listitem" className="flex">
              <CentralInventoryWorkspaceTile />
            </div>
          ) : null}
        </ItemGroup>
        <p className="text-muted-foreground text-sm">
          Central Payment and Central Reports will show here as they are built.
        </p>
      </div>
    </div>
  );
}
