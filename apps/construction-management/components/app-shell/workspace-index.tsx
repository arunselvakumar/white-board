import { ItemGroup } from "@repo/ui/components/item";

import { PageHeader } from "@/components/app-shell/page-header";
import { HrmsWorkspaceTile } from "@/components/hrms/hrms-workspace-tile";
import {
  CentralInventoryWorkspaceTile,
  CentralStoreWorkspaceTile,
} from "@/components/procurement/stores/central-store-workspace-tiles";

/**
 * Work across all Projects (`docs/00-overview.md`): HRMS with today's
 * headline numbers (CM-319), Central Store (CM-508) and Central Inventory
 * (CM-509) for members who may read them; Central Payment and Central
 * Reports follow. The page decides which tiles the viewer may see.
 */
export function WorkspaceIndex({
  centralStore,
  centralInventory,
}: {
  centralStore: boolean;
  centralInventory: boolean;
}) {
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
