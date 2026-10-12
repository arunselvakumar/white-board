import { ItemGroup } from "@repo/ui/components/item";

import { PageHeader } from "@/components/app-shell/page-header";
import { CentralPaymentWorkspaceTile } from "@/components/finance/central-payment/central-payment-workspace-tile";
import { HrmsWorkspaceTile } from "@/components/hrms/hrms-workspace-tile";
import {
  CentralInventoryWorkspaceTile,
  CentralStoreWorkspaceTile,
} from "@/components/procurement/stores/central-store-workspace-tiles";

/**
 * Work across all Projects (`docs/00-overview.md`): HRMS with today's
 * headline numbers (CM-319), Central Store (CM-508), Central Inventory
 * (CM-509) and Central Payment (CM-709) for members who may read them;
 * Central Reports follows. The page decides which tiles the viewer may see.
 */
export function WorkspaceIndex({
  centralStore,
  centralInventory,
  centralPayment = false,
}: {
  centralStore: boolean;
  centralInventory: boolean;
  centralPayment?: boolean;
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
          {centralPayment ? (
            <div role="listitem" className="flex">
              <CentralPaymentWorkspaceTile />
            </div>
          ) : null}
        </ItemGroup>
        <p className="text-muted-foreground text-sm">
          Central Reports will show here when it is built.
        </p>
      </div>
    </div>
  );
}
