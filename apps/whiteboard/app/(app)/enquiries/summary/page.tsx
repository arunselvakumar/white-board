import type { Metadata } from "next";

import { EnquirySummaryScreen } from "@/components/enquiries/enquiry-summary-screen";

export const metadata: Metadata = { title: "Enquiry summary" };

export default function EnquirySummaryPage() {
  return <EnquirySummaryScreen />;
}
