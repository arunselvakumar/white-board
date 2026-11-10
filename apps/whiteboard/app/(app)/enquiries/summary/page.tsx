import type { Metadata } from "next";

import { EnquirySummaryScreen } from "@/app/(app)/enquiries/summary/_components/enquiry-summary-screen";

export const metadata: Metadata = { title: "Enquiry summary" };

export default function EnquirySummaryPage() {
  return <EnquirySummaryScreen />;
}
