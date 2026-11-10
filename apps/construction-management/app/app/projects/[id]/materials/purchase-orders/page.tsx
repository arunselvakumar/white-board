import type { Metadata } from "next";

import { PurchaseOrdersPage } from "@/app/app/projects/[id]/materials/purchase-orders/_components/purchase-orders-page";

export const metadata: Metadata = { title: "Purchase Orders" };

/** The Project's Purchase Orders. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseOrdersPage projectId={id} />;
}
