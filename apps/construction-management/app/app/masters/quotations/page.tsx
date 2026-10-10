import type { Metadata } from "next";

import { QuotationsPage } from "@/components/parties/quotations-page";

export const metadata: Metadata = { title: "View Quotations" };

export default function QuotationsMasterPage() {
  return <QuotationsPage />;
}
