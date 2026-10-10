import type { Metadata } from "next";

import { PurchaseRequestsPage } from "@/components/procurement/purchase-requests/purchase-requests-page";

export const metadata: Metadata = { title: "Purchase Requests" };

/** The Project's Purchase Requests (CM-503). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseRequestsPage projectId={id} />;
}
