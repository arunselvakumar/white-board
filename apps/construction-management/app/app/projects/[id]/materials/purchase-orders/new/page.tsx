import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { PurchaseOrderForm } from "@/components/procurement/purchase-orders/purchase-order-form";

export const metadata: Metadata = { title: "Add Purchase Order" };

/** Add Purchase Order; Generate PO passes `?purchaseRequestId=` (CM-504). */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ purchaseRequestId?: string | string[] }>;
}) {
  const { id } = await params;
  const { purchaseRequestId } = await searchParams;
  return (
    <div className="w-full space-y-4">
      <h2 className="text-lg font-semibold">Add Purchase Order</h2>
      <QuerySuspense>
        <PurchaseOrderForm
          projectId={id}
          {...(typeof purchaseRequestId === "string"
            ? { initialPurchaseRequestId: purchaseRequestId }
            : {})}
        />
      </QuerySuspense>
    </div>
  );
}
