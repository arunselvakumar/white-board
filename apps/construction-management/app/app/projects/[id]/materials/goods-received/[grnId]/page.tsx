import type { Metadata } from "next";

import { GoodsReceiptDetail } from "@/components/procurement/goods-receipts/goods-receipt-detail";

export const metadata: Metadata = { title: "Goods Receipt" };

/** One Goods Receipt (CM-505). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string; grnId: string }>;
}) {
  const { id, grnId } = await params;
  return <GoodsReceiptDetail projectId={id} id={grnId} />;
}
