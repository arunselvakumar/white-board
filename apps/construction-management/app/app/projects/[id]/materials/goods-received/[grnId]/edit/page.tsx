import type { Metadata } from "next";

import { EditGoodsReceiptScreen } from "@/app/app/projects/[id]/materials/goods-received/_components/goods-receipt-form";
import { GoodsReceiptFormSkeleton } from "@/app/app/_components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Edit Goods Receipt" };

/** Edit a Goods Receipt. */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; grnId: string }>;
}) {
  const { id, grnId } = await params;
  return (
    <QuerySuspense
      fallback={<GoodsReceiptFormSkeleton projectId={id} receiptId={grnId} />}
    >
      <EditGoodsReceiptScreen projectId={id} id={grnId} />
    </QuerySuspense>
  );
}
