import type { Metadata } from "next";

import { StockScreen } from "@/app/(app)/preschool/stock/_components/stock-screen";

export const metadata: Metadata = { title: "Stock" };

export default function StockPage() {
  return <StockScreen />;
}
