import { ItemGroup } from "@repo/ui/components/item";

import { PageHeader } from "@/components/app-shell/page-header";
import { CentralPaymentWorkspaceTile } from "@/components/finance/central-payment/central-payment-workspace-tile";
import { PartyBalanceWorkspaceTile } from "@/components/finance/parties/party-balance-workspace-tile";
import { CentralReportsWorkspaceTile } from "@/components/reports/central-reports-workspace-tile";
import {
  CentralInventoryWorkspaceTile,
  CentralStoreWorkspaceTile,
} from "@/components/procurement/stores/central-store-workspace-tiles";

/**
 * Work across all Projects (`docs/00-overview.md`): Central Store (CM-508),
 * Central Inventory (CM-509), Central Payment (CM-709), Party Balance
 * (CM-708) and Central Reports (CM-903) for members who may read them. The
 * page decides which tiles the viewer may see; the Workspace submenu lists
 * the same five pages. HRMS had a tile here until it moved to Human
 * Resources (ADR CM-0034).
 */
export function WorkspaceIndex({
  centralStore,
  centralInventory,
  centralPayment = false,
  partyBalance = false,
  centralReports = false,
}: {
  centralStore: boolean;
  centralInventory: boolean;
  centralPayment?: boolean;
  partyBalance?: boolean;
  centralReports?: boolean;
}) {
  const nothing =
    !centralStore &&
    !centralInventory &&
    !centralPayment &&
    !partyBalance &&
    !centralReports;
  return (
    <div className="w-full p-6">
      <div className="w-full max-w-4xl space-y-6">
        <PageHeader title="Workspace" meta="Work across all your Projects." />
        {nothing ? (
          <p className="text-muted-foreground text-sm">
            Nothing here for you yet. Central Store, Central Inventory, Central
            Payment, Party Balance and Central Reports show once your Role may
            read them.
          </p>
        ) : (
          <ItemGroup className="grid gap-3 sm:grid-cols-2">
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
            {partyBalance ? (
              <div role="listitem" className="flex">
                <PartyBalanceWorkspaceTile />
              </div>
            ) : null}
            {centralReports ? (
              <div role="listitem" className="flex">
                <CentralReportsWorkspaceTile />
              </div>
            ) : null}
          </ItemGroup>
        )}
      </div>
    </div>
  );
}
