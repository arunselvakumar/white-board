import type { Metadata } from "next";

import { QuerySuspense } from "@/components/query-suspense";
import { PurchaseOrderDetailPage } from "@/components/procurement/purchase-orders/purchase-order-detail";
import { PurchaseOrderDetailSkeleton } from "@/components/procurement/procurement-skeletons";

export const metadata: Metadata = { title: "Purchase Order" };

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; poId: string }>;
  searchParams: Promise<{ uploadFailed?: string | string[] }>;
}) {
  const { id, poId } = await params;
  const { uploadFailed } = await searchParams;
  return (
    <QuerySuspense fallback={<PurchaseOrderDetailSkeleton projectId={id} />}>
      <PurchaseOrderDetailPage
        projectId={id}
        id={poId}
        uploadFailed={
          typeof uploadFailed === "string" ? Number(uploadFailed) || 0 : 0
        }
      />
    </QuerySuspense>
  );
}
