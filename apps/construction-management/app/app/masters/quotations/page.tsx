import type { Metadata } from "next";

import { QuotationsPage } from "@/app/app/masters/quotations/_components/quotations-page";

export const metadata: Metadata = { title: "View Quotations" };

export default function QuotationsMasterPage() {
  return <QuotationsPage />;
}
