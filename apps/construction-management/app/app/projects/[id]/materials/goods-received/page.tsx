import type { Metadata } from "next";

import { GoodsReceiptsList } from "@/components/procurement/goods-receipts/goods-receipts-list";

export const metadata: Metadata = { title: "Goods Received" };

/** The Project's Goods Receipts (CM-505). */
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GoodsReceiptsList projectId={id} />;
}
