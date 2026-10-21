import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { EditPurchaseOrder } from "@/components/procurement/purchase-orders/edit-purchase-order";
import {
  EditDocumentSkeleton,
  PurchaseOrderFormSkeleton,
} from "@/components/procurement/procurement-skeletons";

export const metadata: Metadata = { title: "Edit Purchase Order" };

export default async function Page({
  params,
}: {
  params: Promise<{ id: string; poId: string }>;
}) {
  const { id, poId } = await params;
  return (
    <QuerySuspense
      fallback={
        <EditDocumentSkeleton>
          <PurchaseOrderFormSkeleton />
        </EditDocumentSkeleton>
      }
    >
      <EditPurchaseOrder projectId={id} id={poId} />
    </QuerySuspense>
  );
}
