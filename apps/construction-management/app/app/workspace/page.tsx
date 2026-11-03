import type { Metadata } from "next";

import { viewerCan } from "@/app/app/_lib/viewer-can";
import { WorkspaceIndex } from "@/components/app-shell/workspace-index";

export const metadata: Metadata = { title: "Workspace" };

/** The Workspace index, with the tiles the viewer may read. */
export default async function WorkspacePage() {
  const [
    centralStore,
    centralInventory,
    centralPayment,
    partyBalance,
    centralReports,
  ] = await Promise.all([
    viewerCan("procurement.central_store", "read"),
    viewerCan("procurement.central_inventory", "read"),
    viewerCan("finance.central_payment", "read"),
    // Party Balance reads Parties (CM-708), the same rule as its API.
    viewerCan("finance.parties", "read"),
    viewerCan("reporting.central_reports", "read"),
  ]);
  return (
    <WorkspaceIndex
      centralStore={centralStore}
      centralInventory={centralInventory}
      centralPayment={centralPayment}
      partyBalance={partyBalance}
      centralReports={centralReports}
    />
  );
}
