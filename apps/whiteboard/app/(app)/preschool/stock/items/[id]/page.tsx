import type { Metadata } from "next";

import { StockItemLedgerScreen } from "@/app/(app)/preschool/stock/items/[id]/_components/stock-item-ledger-screen";

export const metadata: Metadata = { title: "Stock ledger" };

export default async function StockItemLedgerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <StockItemLedgerScreen itemId={id} />;
}
