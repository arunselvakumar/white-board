import type { Metadata } from "next";

import { GoodsReceiptDetail } from "@/components/procurement/goods-receipts/goods-receipt-detail";
import { GoodsReceiptDetailSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Goods Receipt" };

/** One Goods Receipt (CM-505). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; grnId: string }>;
}) {
  const { id, grnId } = await params;
  return (
    <QuerySuspense fallback={<GoodsReceiptDetailSkeleton projectId={id} />}>
      <GoodsReceiptDetail projectId={id} id={grnId} />
    </QuerySuspense>
  );
}
