import type { Metadata } from "next";

import { PurchaseRequestWizard } from "@/components/procurement/purchase-requests/purchase-request-wizard";

export const metadata: Metadata = { title: "Add Purchase Request" };

/**
 * Add Purchase Request (CM-503). From Current Inventory (mode B) the
 * chosen materials come as `?materials=<id>,<id>`.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ materials?: string | string[] }>;
}) {
  const { id } = await params;
  const { materials } = await searchParams;
  const ids = (typeof materials === "string" ? materials : "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value !== "")
    .slice(0, 200);
  return (
    <div className="w-full space-y-4">
      <h2 className="text-lg font-semibold">Add Purchase Request</h2>
      <PurchaseRequestWizard projectId={id} initialMaterialIds={ids} />
    </div>
  );
}
