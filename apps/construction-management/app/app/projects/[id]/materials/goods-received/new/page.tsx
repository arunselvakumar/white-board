import type { Metadata } from "next";

import { NewGoodsReceiptScreen } from "@/components/procurement/goods-receipts/goods-receipt-form";

export const metadata: Metadata = { title: "Record Goods Receipt" };

/** Record Goods Receipt on the Project (CM-505). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <NewGoodsReceiptScreen projectId={id} />;
}
