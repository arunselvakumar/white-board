import type { Metadata } from "next";

import { NewGoodsReceiptScreen } from "@/components/procurement/goods-receipts/goods-receipt-form";
import { GoodsReceiptFormSkeleton } from "@/components/procurement/procurement-skeletons";
import { QuerySuspense } from "@/components/query-suspense";

export const metadata: Metadata = { title: "Record Goods Receipt" };

/** Record Goods Receipt on the Project (CM-505). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <QuerySuspense
      fallback={
        <GoodsReceiptFormSkeleton projectId={id} title="Record Goods Receipt" />
      }
    >
      <NewGoodsReceiptScreen projectId={id} />
    </QuerySuspense>
  );
}
