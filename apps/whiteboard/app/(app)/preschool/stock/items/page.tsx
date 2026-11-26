import type { Metadata } from "next";

import { StockItemsScreen } from "@/app/(app)/preschool/stock/items/_components/stock-items-screen";

export const metadata: Metadata = { title: "Stock Items" };

export default function StockItemsPage() {
  return <StockItemsScreen />;
}
