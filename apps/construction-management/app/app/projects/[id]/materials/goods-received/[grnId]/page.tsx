import type { Metadata } from "next";

import { GoodsReceiptDetail } from "@/app/app/projects/[id]/materials/goods-received/[grnId]/_components/goods-receipt-detail";
import { GoodsReceiptDetailSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Goods Receipt" };

/** One Goods Receipt. */
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
