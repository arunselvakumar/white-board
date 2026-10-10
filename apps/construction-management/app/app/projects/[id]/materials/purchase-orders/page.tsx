import type { Metadata } from "next";

import { PurchaseOrdersPage } from "@/components/procurement/purchase-orders/purchase-orders-page";

export const metadata: Metadata = { title: "Purchase Orders" };

/** The Project's Purchase Orders (CM-504). Store POs come with CM-508. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseOrdersPage projectId={id} />;
}
